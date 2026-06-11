/**
 * Pure goal bloom lifecycle rules (no Prisma). Shared by server recomputation and client tree normalization.
 *
 * Continuations (`parentGoalId` / successors) do **not** affect lifecycle — only planning + achievement do.
 */

import { normalizeLegacyBloomStatus } from "@/lib/bloom-display";
import {
  milestoneDoneForSemantics,
  type MilestoneSemanticsInput,
} from "@/lib/milestone-semantics";

/** Input shape for lifecycle / display normalization (includes explicit milestone completion). */
export type MilestoneLifecycleInput = MilestoneSemanticsInput;

/** @deprecated Prefer {@link milestoneDoneForSemantics}; kept for call-site churn control. */
export function milestoneIsFullyCompleted(milestone: MilestoneLifecycleInput): boolean {
  return milestoneDoneForSemantics(milestone);
}

/** Goal is achieved for lifecycle → COMPLETE (roadmap goals vs moment/event without milestones). */
export function goalAchievedForBloomLifecycle(
  goal: { goalType: string; future: boolean; year: number | null },
  milestones: MilestoneLifecycleInput[],
  nowYear: number,
): boolean {
  if (milestones.length === 0) {
    if (goal.goalType === "moment" || goal.goalType === "event") {
      return !goal.future && !(goal.year != null && goal.year > nowYear);
    }
    return false;
  }
  return milestones.every(milestoneDoneForSemantics);
}

export type GoalLifecycleBloom = "ACTIVE" | "COMPLETE";

/** Canonical lifecycle states for an active (non-ON_HOLD) goal. */
export function computeGoalLifecycleBloom(
  goal: { goalType: string; future: boolean; year: number | null },
  milestones: MilestoneLifecycleInput[],
  nowYear: number,
): GoalLifecycleBloom {
  if (goalAchievedForBloomLifecycle(goal, milestones, nowYear)) return "COMPLETE";
  return "ACTIVE";
}

export type NormalizeGoalBloomDisplayOptions = {
  /** When set, dev-only diagnostics include this id for stale-ACTIVE logs. */
  goalId?: string;
};

/**
 * Maps persisted bloom to tree/UI semantics.
 *
 * - **Stale ACTIVE:** if the DB still says `ACTIVE` but milestones imply completion, derive lifecycle from
 *   `computeGoalLifecycleBloom` so the tree matches milestone ontology without trusting stale persistence.
 */
export function normalizeGoalBloomForDisplay(
  goal: { goalType: string; future: boolean; year: number | null; bloomStatus: string },
  milestones: MilestoneLifecycleInput[],
  options?: NormalizeGoalBloomDisplayOptions,
): "ACTIVE" | "COMPLETE" | "PAUSED" | "MAINTAINING" | "ABANDONED" {
  const normalized = normalizeLegacyBloomStatus(goal.bloomStatus) ?? "ACTIVE";
  if (normalized === "PAUSED") return "PAUSED";
  if (normalized === "ABANDONED") return "ABANDONED";
  if (normalized === "MAINTAINING") return "MAINTAINING";
  if (normalized === "COMPLETE") return "COMPLETE";

  const nowYear = new Date().getFullYear();
  if (normalized === "ACTIVE" && milestones.length > 0) {
    const computed = computeGoalLifecycleBloom(goal, milestones, nowYear);
    if (computed === "COMPLETE") {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[pathfinder/bloom] stale ACTIVE with completed milestones", {
          goalId: options?.goalId ?? "(unknown)",
          persistedBloom: goal.bloomStatus,
          computedBloom: computed,
          milestoneCount: milestones.length,
        });
      }
      return computed;
    }
  }

  return normalized;
}
