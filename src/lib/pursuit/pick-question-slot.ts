import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { isRecentlyCompletedPursuit } from "@/lib/map/reading-dirty-ledger";
import { CLARIFIER_BATCH_MAX } from "@/lib/pursuit/clarifier-prompt-blocks";
import {
  isQuickQuestionsQuiet,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  clarifierKind,
  type Clarifier,
  type EnrichAnswer,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

export type QuestionSlot = "none" | "clarify" | "retrospective" | "suggest_add";

/** Retrospective clarifier ids use this prefix so sequencing survives without new DB fields. */
export const RETROSPECTIVE_CLARIFIER_ID_PREFIX = "retro-";

export type QuestionSlotContext = {
  signal: PursuitSignal;
  status: string;
  completedAt: Date | null;
  significance: number;
  enrichAnswers: EnrichAnswer[];
  quickQuestionsQuietUntil?: string | null;
  siblingGoalIds: string[];
  existingRelationshipPeerIds: string[];
  enrichOptions?: PursuitEnrichOptions;
};

export function hasRetrospectiveEnrichAnswer(enrichAnswers: EnrichAnswer[]): boolean {
  return enrichAnswers.some((answer) =>
    answer.clarifierId.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX),
  );
}

/** Deterministic slot before model drafts MC copy. */
export function pickQuestionSlotForPursuit(ctx: QuestionSlotContext): QuestionSlot {
  const status = ctx.status ?? "ACTIVE";

  if (status === "PAUSED") {
    return "none";
  }

  if (isQuickQuestionsQuiet(ctx.quickQuestionsQuietUntil)) {
    return "none";
  }

  if (status === "COMPLETE") {
    const recentlyComplete = isRecentlyCompletedPursuit(status, ctx.completedAt);
    if (recentlyComplete && hasRetrospectiveEnrichAnswer(ctx.enrichAnswers)) {
      return "suggest_add";
    }
    return "retrospective";
  }

  // ACTIVE and MAINTAINING — ask forward-looking contextual questions.
  return "clarify";
}

export function filterClarifiersForQuestionSlot(
  clarifiers: Clarifier[],
  slot: QuestionSlot,
): Clarifier[] {
  if (slot === "none") {
    return [];
  }

  if (slot === "suggest_add") {
    const tagged = clarifiers.filter((c) => clarifierKind(c) === "suggest_add");
    return tagged.length > 0 ? [tagged[0]!] : [];
  }

  if (slot === "retrospective") {
    const tagged = clarifiers.filter((c) => clarifierKind(c) === "retrospective");
    if (tagged.length > 0) return tagged.slice(0, CLARIFIER_BATCH_MAX);
    const legacyRetro = clarifiers.filter((c) =>
      c.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX),
    );
    if (legacyRetro.length > 0) return legacyRetro.slice(0, CLARIFIER_BATCH_MAX);
    return [];
  }

  // clarify slot — forward-looking only; exclude retrospective and suggest_add.
  const forward = clarifiers.filter((c) => {
    const kind = clarifierKind(c);
    return (
      (kind === "clarify" || !c.kind) &&
      !c.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX)
    );
  });
  return forward.slice(0, CLARIFIER_BATCH_MAX);
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
  const lines = [
    `Requested quick-question slot: ${slot}`,
    `Pursuit status: ${ctx.status}`,
    `Significance: ${ctx.significance}`,
  ];

  if (slot === "none") {
    lines.push("Do NOT generate quick questions for this pursuit on this sync.");
    if (ctx.status === "PAUSED") {
      lines.push("PAUSED pursuits stay silent — return clarifiers: [].");
    }
    if (isQuickQuestionsQuiet(ctx.quickQuestionsQuietUntil)) {
      lines.push("Cooldown active — return clarifiers: [].");
    }
    return lines;
  }

  if (slot === "suggest_add") {
    lines.push(
      'Generate exactly one suggest_add clarifier (kind: "suggest_add") proposing a natural follow-on pursuit.',
      "Retrospective questions should already be answered — do not generate retrospective or forward clarify questions.",
      "Include suggestedTitle and suggestedCategoryId from scoped context taxonomy.",
      'Options must include "No thanks".',
    );
    return lines;
  }

  if (slot === "retrospective") {
    lines.push(
      `Generate up to ${CLARIFIER_BATCH_MAX} retrospective clarifiers (kind: "retrospective").`,
      'Each id MUST start with "retro-" (e.g. "retro-what-unlocked").',
      "Ask what finishing unlocked, what made it work, or what changed — NEVER what stage the user is on.",
      "Read enrichAnswers — do not repeat answered facts.",
      "Return [] when no high-value retrospective gap remains.",
    );
    return lines;
  }

  lines.push(
    `Generate up to ${CLARIFIER_BATCH_MAX} forward-looking clarify clarifiers (kind: "clarify" or omit kind).`,
    "Read enrichAnswers — do not repeat answered facts; build on prior answers.",
    "Return [] when no high-value gap remains.",
  );
  return lines;
}

/** Per-pursuit slot block for reflect user message (production path). */
export function formatReflectPursuitSlotLines(
  pursuitId: string,
  ctx: QuestionSlotMessageContext,
): string {
  const slot = pickQuestionSlotForPursuit(ctx);
  const slotLines = questionSlotUserMessageLines(slot, ctx);
  return [`<quick_questions pursuitId="${pursuitId}">`, ...slotLines, "</quick_questions>"].join(
    "\n",
  );
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
