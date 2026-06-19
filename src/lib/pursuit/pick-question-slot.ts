import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import {
  hasMinimumContextSignal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { isRecentlyCompletedPursuit } from "@/lib/map/reading-dirty-ledger";
import {
  clarifierKind,
  type Clarifier,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

export type QuestionSlot = "clarify" | "suggest_add";

export type QuestionSlotContext = {
  signal: PursuitSignal;
  status: string;
  completedAt: Date | null;
  siblingGoalIds: string[];
  existingRelationshipPeerIds: string[];
  enrichOptions?: PursuitEnrichOptions;
};

/** Deterministic slot before model drafts MC copy. */
export function pickQuestionSlotForPursuit(ctx: QuestionSlotContext): QuestionSlot {
  const recentlyComplete = isRecentlyCompletedPursuit(ctx.status, ctx.completedAt);

  if (recentlyComplete) {
    return "suggest_add";
  }

  if (!hasMinimumContextSignal(ctx.signal)) {
    return "clarify";
  }

  return "clarify";
}

export function filterClarifiersForQuestionSlot(
  clarifiers: Clarifier[],
  slot: QuestionSlot,
): Clarifier[] {
  const tagged = clarifiers.filter((c) => clarifierKind(c) === slot);
  if (tagged.length > 0) return [tagged[0]!];
  if (slot === "clarify") {
    const legacy = clarifiers.filter((c) => !c.kind || c.kind === "clarify");
    if (legacy.length > 0) return [legacy[0]!];
  }
  return [];
}

export function applyQuestionSlotToResult(
  result: PursuitEnrichResult,
  ctx: QuestionSlotContext,
): PursuitEnrichResult {
  const slot = pickQuestionSlotForPursuit(ctx);
  return {
    ...result,
    clarifiers: filterClarifiersForQuestionSlot(result.clarifiers, slot),
  };
}

export type QuestionSlotMessageContext = QuestionSlotContext & {
  siblingPursuits?: Array<{ id: string; title: string }>;
};

export function questionSlotUserMessageLines(
  slot: QuestionSlot,
  ctx: QuestionSlotMessageContext,
): string[] {
  const lines = [`Requested quick-question slot: ${slot}`];
  if (slot === "suggest_add") {
    lines.push(
      'Generate exactly one suggest_add clarifier (kind: "suggest_add") proposing a natural follow-on pursuit.',
      "Include suggestedTitle and suggestedCategoryId from scoped context taxonomy.",
      'Options must include "No thanks".',
    );
  }
  if (slot === "clarify") {
    lines.push('Generate at most one clarify clarifier (kind: "clarify" or omit kind).');
  }
  return lines;
}

export async function loadRelationshipPeerIdsForGoal(
  userId: string,
  goalId: string,
): Promise<string[]> {
  const rows = await prisma.pursuitRelationship.findMany({
    where: {
      userId,
      OR: [{ goalAId: goalId }, { goalBId: goalId }],
    },
    select: { goalAId: true, goalBId: true },
  });
  return rows.map((row) => (row.goalAId === goalId ? row.goalBId : row.goalAId));
}
