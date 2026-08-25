/**
 * Update-context reconciliation.
 *
 * Ported 18 August 2026 from `@/lib/imports/apply-context-proposal.ts`, which
 * belonged to the retired V2 source-to-life-model. The entities changed
 * (Chapter/LifeObservation/ImportProposal -> Place/Update); the behaviour did
 * not, and the behaviour is the point:
 *
 *   - accepting the same meaning twice must not duplicate it;
 *   - correcting one statement must not rewrite the ones around it;
 *   - the server never infers supersession — the user names the target.
 *
 * These functions are deliberately pure. Persistence lives in `service.ts`.
 * See docs/current/ALMANAC-MEMORY-INTEGRITY-SPEC.md.
 */

import type { AlmanacUpdateStateValue } from "@/lib/almanac/protocol";
import { AlmanacConflictError } from "@/lib/almanac/service";

/**
 * Append a confirmed statement to a Place's context without creating a visible
 * duplicate. Case-insensitive containment check: if the meaning is already
 * present in any form, the existing text is returned untouched.
 */
export function appendConfirmedContext(current: string | null, addition: string): string {
  const existing = current?.trim() ?? "";
  const next = addition.trim();
  if (!existing) return next;
  if (existing.toLocaleLowerCase().includes(next.toLocaleLowerCase())) return existing;
  return `${existing}\n\n${next}`;
}

/**
 * Replace one previously confirmed paragraph without rewriting unrelated
 * context. Returns null when the target paragraph is not found, so the caller
 * can treat "nothing matched" as a conflict rather than silently appending.
 */
export function replaceConfirmedContext(
  current: string | null,
  previous: string,
  replacement: string,
): string | null {
  const existing = current?.trim() ?? "";
  const target = previous.trim().toLowerCase();
  const next = replacement.trim();
  if (!existing || !target || !next) return null;
  const paragraphs = existing.split(/\r?\n\r?\n/);
  const index = paragraphs.findIndex((paragraph) => paragraph.trim().toLowerCase() === target);
  if (index < 0) return null;
  paragraphs[index] = next;
  return paragraphs.join("\n\n");
}

export type UpdateApplicationPlanInput = {
  /** The user's decision for this packet line. */
  accepted: boolean;
  /** Explicit Place resolution, or null to use the packet's deterministic name. */
  placeId: string | null;
  /** Explicit correction target. Never inferred by the server. */
  supersedesUpdateId: string | null;
  state: AlmanacUpdateStateValue;
  /** The Place the packet line resolved to, if it already exists. */
  targetPlace: null | { id: string; userId: string };
  /** The Update named by supersedesUpdateId, if it exists. */
  targetUpdate: null | {
    id: string;
    userId: string;
    placeId: string;
    supersededAt: Date | null;
  };
  /** Owner of the import being committed. */
  userId: string;
};

export type UpdateApplicationPlan =
  | { action: "skip" }
  | { action: "create_place_and_update" }
  | { action: "append_update" }
  | { action: "supersede_update" };

/**
 * Decide what a single accepted packet line does, without touching the
 * database. Every rejection is a conflict the user can be shown, not a silent
 * no-op.
 */
export function planUpdateApplication(input: UpdateApplicationPlanInput): UpdateApplicationPlan {
  if (!input.accepted) {
    if (input.placeId || input.supersedesUpdateId) {
      throw new AlmanacConflictError("REJECTED_LINE_CANNOT_RESOLVE");
    }
    return { action: "skip" };
  }

  if (input.supersedesUpdateId) {
    if (!input.targetUpdate) {
      throw new AlmanacConflictError("MISSING_SUPERSEDE_TARGET");
    }
    if (input.targetUpdate.userId !== input.userId) {
      throw new AlmanacConflictError("CROSS_OWNER_SUPERSEDE");
    }
    if (input.targetUpdate.supersededAt !== null) {
      throw new AlmanacConflictError("ALREADY_SUPERSEDED");
    }
    if (!input.targetPlace) {
      throw new AlmanacConflictError("MISSING_PLACE_FOR_SUPERSEDE");
    }
    if (input.targetUpdate.placeId !== input.targetPlace.id) {
      throw new AlmanacConflictError("SUPERSEDE_CROSSES_PLACE");
    }
    return { action: "supersede_update" };
  }

  if (input.placeId) {
    if (!input.targetPlace) {
      throw new AlmanacConflictError("MISSING_PLACE");
    }
    if (input.targetPlace.userId !== input.userId) {
      throw new AlmanacConflictError("CROSS_OWNER_PLACE");
    }
    return { action: "append_update" };
  }

  return input.targetPlace ? { action: "append_update" } : { action: "create_place_and_update" };
}
