import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import {
  milestonesToGroundingInput,
  validateClarifierAnswerAgainstMilestones,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import {
  enrichAnswersSchema,
  enrichAnswerSchema,
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
): Promise<void> {
  const cache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  if (!cache?.pursuitInsights) return;

  const pursuits = parsePursuitInsightRecord(cache.pursuitInsights, "pursuit");
  const entry = pursuits[goalId];
  if (!entry?.clarifiers?.length) return;

  const clarifiers = entry.clarifiers.filter((c) => c.id !== clarifierId);
  pursuits[goalId] = {
    ...entry,
    clarifiers: clarifiers.length > 0 ? clarifiers : undefined,
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
