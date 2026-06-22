import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import {
  milestonesToGroundingInput,
  validateClarifierAnswerAgainstMilestones,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import { RETROSPECTIVE_CLARIFIER_ID_PREFIX } from "@/lib/pursuit/pick-question-slot";
import { appendSkippedClarifierPrompt } from "@/lib/pursuit/pursuit-cache-patch";
import { syncPursuitPanel } from "@/lib/pursuit/generate-pursuit-enrich";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import {
  enrichAnswersSchema,
  enrichAnswerSchema,
  clarifierKind,
  type Clarifier,
  type EnrichAnswer,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

function parseExistingAnswers(raw: unknown): EnrichAnswer[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Strip one AI-suggested milestone title from the pursuit insight cache (case-insensitive). */
export function filterSuggestedMilestoneByTitle<T extends { title: string }>(
  items: T[],
  title: string,
): T[] {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.title.trim().toLowerCase() !== normalized);
}

export async function pruneSuggestedMilestoneFromInsightCache(
  userId: string,
  goalId: string,
  title: string,
): Promise<void> {
  const cache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  if (!cache?.pursuitInsights) return;

  const pursuits = parsePursuitInsightRecord(cache.pursuitInsights, "pursuit");
  const entry = pursuits[goalId];
  if (!entry?.suggestedMilestones?.length) return;

  const suggestedMilestones = filterSuggestedMilestoneByTitle(entry.suggestedMilestones, title);
  pursuits[goalId] = {
    ...entry,
    suggestedMilestones: suggestedMilestones.length > 0 ? suggestedMilestones : undefined,
  };
  await prisma.insightCache.update({
    where: { userId },
    data: { pursuitInsights: pursuits },
  });
}

export async function pruneClarifierFromInsightCache(
  userId: string,
  goalId: string,
  clarifierId: string,
): Promise<{ shouldReplenish: boolean }> {
  const cache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  if (!cache?.pursuitInsights) return { shouldReplenish: false };

  const pursuits = parsePursuitInsightRecord(cache.pursuitInsights, "pursuit");
  const entry = pursuits[goalId];
  if (!entry?.clarifiers?.length) return { shouldReplenish: false };

  const dismissed = entry.clarifiers.find((c) => c.id === clarifierId);
  const clarifiers = entry.clarifiers.filter((c) => c.id !== clarifierId);
  const pendingClearedByDismiss = clarifiers.length === 0;
  const skippedClarifierPrompts = dismissed
    ? appendSkippedClarifierPrompt(entry.skippedClarifierPrompts, dismissed.prompt)
    : entry.skippedClarifierPrompts;

  pursuits[goalId] = {
    ...entry,
    clarifiers: clarifiers.length > 0 ? clarifiers : undefined,
    skippedClarifierPrompts,
    // Dismiss-only empty queue: no cooldown — replenish may follow immediately.
    quickQuestionsQuietUntil: pendingClearedByDismiss
      ? undefined
      : entry.quickQuestionsQuietUntil,
  };
  await prisma.insightCache.update({
    where: { userId },
    data: { pursuitInsights: pursuits },
  });

  return { shouldReplenish: pendingClearedByDismiss };
}

/** Remove a pending quick question without storing an answer — idempotent. */
export async function dismissClarifierForUser(
  userId: string,
  goalId: string,
  clarifierId: string,
  options?: { clarifyTitles?: boolean },
): Promise<{ replenished: boolean; clarifierCount: number }> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!goal) {
    throw new Error("Not found");
  }
  const { shouldReplenish } = await pruneClarifierFromInsightCache(userId, goalId, clarifierId);
  const clarifyTitles = options?.clarifyTitles !== false;
  if (!shouldReplenish || !clarifyTitles) {
    return { replenished: false, clarifierCount: 0 };
  }
  try {
    const result = await syncPursuitPanel(userId, goalId, "replenish", {
      ...DEFAULT_PURSUIT_ENRICH_OPTIONS,
      clarifyTitles: true,
    });
    return { replenished: true, clarifierCount: result.clarifierCount };
  } catch (err) {
    console.error("[dismissClarifierForUser] replenish failed", err);
    return { replenished: false, clarifierCount: 0 };
  }
}

function isForwardClarifier(clarifier: Clarifier): boolean {
  const kind = clarifierKind(clarifier);
  return (
    (kind === "clarify" || !clarifier.kind) &&
    !clarifier.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX)
  );
}

function isRetrospectiveClarifier(clarifier: Clarifier): boolean {
  const kind = clarifierKind(clarifier);
  return kind === "retrospective" || clarifier.id.startsWith(RETROSPECTIVE_CLARIFIER_ID_PREFIX);
}

/** Drop pending clarifiers that are moot after a status change; clear cooldown. Answered enrichAnswers untouched. */
export async function pruneMootPendingClarifiersOnStatusChange(
  userId: string,
  goalId: string,
  newStatus: string,
): Promise<void> {
  const cache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  if (!cache?.pursuitInsights) return;

  const pursuits = parsePursuitInsightRecord(cache.pursuitInsights, "pursuit");
  const entry = pursuits[goalId];
  if (!entry) return;

  const pending = entry.clarifiers ?? [];
  let clarifiers: Clarifier[] = pending;

  if (newStatus === "PAUSED") {
    clarifiers = [];
  } else if (newStatus === "COMPLETE") {
    clarifiers = pending.filter(
      (c) => isRetrospectiveClarifier(c) || clarifierKind(c) === "suggest_add",
    );
  } else {
    clarifiers = pending.filter((c) => isForwardClarifier(c));
  }

  pursuits[goalId] = {
    ...entry,
    clarifiers: clarifiers.length > 0 ? clarifiers : undefined,
    quickQuestionsQuietUntil: undefined,
  };

  await prisma.insightCache.update({
    where: { userId },
    data: { pursuitInsights: pursuits },
  });
}

export async function applyClarifierAnswerForUser(
  userId: string,
  goalId: string,
  input: { clarifierId: string; prompt: string; selectedOption: string; options?: string[] },
): Promise<{ enrichAnswers: EnrichAnswer[]; description: string }> {
  const parsed = enrichAnswerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid clarifier answer");
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      description: true,
      enrichAnswers: true,
      milestones: { select: { title: true, completedAt: true } },
    },
  });
  if (!goal) {
    throw new Error("Not found");
  }

  const milestoneGrounding = milestonesToGroundingInput(goal.milestones);
  const contradiction = validateClarifierAnswerAgainstMilestones(
    parsed.data.selectedOption,
    milestoneGrounding,
  );
  if (contradiction) {
    throw new Error(contradiction);
  }

  const existing = parseExistingAnswers(goal.enrichAnswers);
  const withoutDup = existing.filter((a) => a.clarifierId !== parsed.data.clarifierId);
  const enrichAnswers = [...withoutDup, parsed.data];

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { enrichAnswers },
    select: { description: true, enrichAnswers: true },
  });

  await markPursuitReadingDirty(userId, goalId, "clarifier_answered");
  await pruneClarifierFromInsightCache(userId, goalId, parsed.data.clarifierId);

  const storedAnswers = parseExistingAnswers(updated.enrichAnswers);
  return {
    enrichAnswers: storedAnswers,
    description: updated.description?.trim() ?? "",
  };
}

/** Remove a single stored quick-question answer (by clarifierId). Idempotent. */
export async function deleteClarifierAnswerForUser(
  userId: string,
  goalId: string,
  clarifierId: string,
): Promise<{ enrichAnswers: EnrichAnswer[]; description: string }> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, description: true, enrichAnswers: true },
  });
  if (!goal) {
    throw new Error("Not found");
  }

  const existing = parseExistingAnswers(goal.enrichAnswers);
  const enrichAnswers = existing.filter((a) => a.clarifierId !== clarifierId);

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { enrichAnswers },
    select: { description: true, enrichAnswers: true },
  });

  await markPursuitReadingDirty(userId, goalId, "clarifier_answered");

  const storedAnswers = parseExistingAnswers(updated.enrichAnswers);
  return {
    enrichAnswers: storedAnswers,
    description: updated.description?.trim() ?? "",
  };
}
