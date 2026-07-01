import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { CLARIFIER_INITIAL_BATCH, CLARIFIER_REPLENISH_BATCH } from "@/lib/pursuit/clarifier-prompt-blocks";
import {
  isQuickQuestionsQuiet,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  clarifierKind,
  filterActiveClarifiers,
  type Clarifier,
  type EnrichAnswer,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

export type QuestionSlot = "none" | "clarify" | "retrospective";

/** Retrospective clarifier ids use this prefix so sequencing survives without new DB fields. */
export const RETROSPECTIVE_CLARIFIER_ID_PREFIX = "retro-";

export type QuestionSlotContext = {
  signal: PursuitSignal;
  status: string;
  completedAt: Date | null;
  significance: number | null;
  enrichAnswers: EnrichAnswer[];
  /** User freeform prose (`Goal.background`). */
  background?: string | null;
  quickQuestionsQuietUntil?: string | null;
  siblingGoalIds: string[];
  existingRelationshipPeerIds: string[];
  enrichOptions?: PursuitEnrichOptions;
  /** Max clarifiers to keep after slot filter (initial vs replenish). */
  clarifierOutputMax?: number;
  skippedClarifierPrompts?: string[];
};

/** Deterministic slot before model drafts MC copy. */
export function pickQuestionSlotForPursuit(ctx: QuestionSlotContext): QuestionSlot {
  const status = ctx.status ?? "ACTIVE";

  if (status === "PAUSED" || status === "COMPLETE") {
    return "none";
  }

  if (isQuickQuestionsQuiet(ctx.quickQuestionsQuietUntil)) {
    return "none";
  }

  // ACTIVE and MAINTAINING — ask forward-looking contextual questions.
  return "clarify";
}

export function filterClarifiersForQuestionSlot(
  clarifiers: Clarifier[],
  slot: QuestionSlot,
  maxOutput = CLARIFIER_INITIAL_BATCH,
): Clarifier[] {
  if (slot === "none") {
    return [];
  }

  if (slot === "retrospective") {
    const tagged = filterActiveClarifiers(clarifiers).filter(
      (c) => clarifierKind(c) === "retrospective",
    );
    if (tagged.length > 0) return tagged.slice(0, maxOutput);
    const legacyRetro = clarifiers.filter((c) =>
      c.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX),
    );
    if (legacyRetro.length > 0) return legacyRetro.slice(0, maxOutput);
    return [];
  }

  // clarify slot — forward-looking only; exclude retrospective and retired kinds.
  const forward = filterActiveClarifiers(clarifiers).filter((c) => {
    const kind = clarifierKind(c);
    return (
      (kind === "clarify" || !c.kind) &&
      !c.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX)
    );
  });
  return forward.slice(0, maxOutput);
}

export function applyQuestionSlotToResult(
  result: PursuitEnrichResult,
  ctx: QuestionSlotContext,
): PursuitEnrichResult {
  const slot = pickQuestionSlotForPursuit(ctx);
  const maxOutput = ctx.clarifierOutputMax ?? CLARIFIER_INITIAL_BATCH;
  return {
    ...result,
    clarifiers: filterClarifiersForQuestionSlot(result.clarifiers, slot, maxOutput),
  };
}

export type QuestionSlotMessageContext = QuestionSlotContext & {
  siblingPursuits?: Array<{ id: string; title: string }>;
  /** When true, user skipped prior pending cards — ask different framing, not fewer topics. */
  replenishAfterDismiss?: boolean;
};

function maxOutputFromContext(ctx: QuestionSlotMessageContext): number {
  return ctx.clarifierOutputMax ?? CLARIFIER_INITIAL_BATCH;
}

export function questionSlotUserMessageLines(
  slot: QuestionSlot,
  ctx: QuestionSlotMessageContext,
): string[] {
  const lines = [
    `Requested quick-question slot: ${slot}`,
    `Pursuit status: ${ctx.status}`,
    `Significance: ${ctx.significance ?? "unset"}`,
  ];

  if (ctx.skippedClarifierPrompts?.length) {
    lines.push(
      "User skipped these exact prompts without answering — do NOT repeat this wording:",
      ...ctx.skippedClarifierPrompts.map((p) => `- ${p}`),
      "Skipped ≠ answered. The underlying gap may still exist — ask a sharper angle or next unknown.",
    );
  }

  if (ctx.replenishAfterDismiss) {
    lines.push(
      `Replenishment batch after user skipped pending cards — return up to ${CLARIFIER_REPLENISH_BATCH} new clarifiers.`,
    );
  }

  if (slot === "none") {
    lines.push("Do NOT generate quick questions for this pursuit on this sync.");
    if (ctx.status === "PAUSED") {
      lines.push("PAUSED pursuits stay silent — return clarifiers: [].");
    }
    if (ctx.status === "COMPLETE") {
      lines.push("COMPLETE pursuits stay silent — return clarifiers: [].");
    }
    if (isQuickQuestionsQuiet(ctx.quickQuestionsQuietUntil)) {
      lines.push("Cooldown active — return clarifiers: [].");
    }
    return lines;
  }

  if (slot === "retrospective") {
    lines.push(
      `Generate up to ${maxOutputFromContext(ctx)} retrospective clarifiers (kind: "retrospective").`,
      'Each id MUST start with "retro-" (e.g. "retro-what-unlocked").',
      "Ask what finishing unlocked, what made it work, or what changed — NEVER what stage the user is on.",
      "Read enrichAnswers — do not repeat answered facts.",
      "Return [] when no high-value retrospective gap remains.",
    );
    return lines;
  }

  lines.push(
    `Generate up to ${maxOutputFromContext(ctx)} forward-looking clarify clarifiers (kind: "clarify" or omit kind).`,
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
