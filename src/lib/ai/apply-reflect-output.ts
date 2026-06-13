import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import {
  gateEnrichResult,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  enrichAnswersSchema,
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import { STORY_SCHEMA_VERSION, type StoryGenerationResult } from "@/lib/story/story-types";
import { prisma } from "@/lib/prisma";

function parseEnrichAnswers(raw: unknown): { clarifierId: string; prompt: string; selectedOption: string }[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

async function loadPursuitSignals(userId: string, pursuitIds: string[]): Promise<Map<string, PursuitSignal>> {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      _count: { select: { milestones: true } },
    },
  });
  return new Map(
    goals.map((goal) => [
      goal.id,
      {
        title: goal.title,
        description: goal.description ?? "",
        enrichAnswerCount: parseEnrichAnswers(goal.enrichAnswers).length,
        milestoneCount: goal._count.milestones,
        hasDeadline: goal.deadline != null,
        status: goal.status,
      },
    ]),
  );
}

function toCachePayload(result: PursuitEnrichResult): PursuitEnrichCachePayload | null {
  const hasClarifiers = result.clarifiers.length > 0;
  const hasMilestones = (result.suggestedMilestones?.length ?? 0) > 0;
  const hasInsight = Boolean(result.insight?.headline?.trim());

  if (!hasClarifiers && !hasMilestones && !hasInsight) return null;

  const clarifiers = hasClarifiers ? result.clarifiers : undefined;
  const suggestedMilestones = hasMilestones ? result.suggestedMilestones ?? undefined : undefined;

  if (hasInsight && result.insight) {
    return {
      ...result.insight,
      clarifiers,
      suggestedMilestones,
    };
  }

  return {
    tone: "informational",
    headline: "Help Pathfinder read this pursuit",
    body: "Answer a quick question below — then update your AI reading on Insights.",
    clarifiers,
    suggestedMilestones,
  };
}

async function upsertStoryCache(
  userId: string,
  story: StoryGenerationResult,
  mapVersion: string,
  memoryVersion: number,
): Promise<void> {
  const payloadJson = JSON.stringify(story);
  await prisma.storyCache.upsert({
    where: { userId },
    create: { userId, payload: payloadJson, mapVersion, memoryVersion },
    update: { payload: payloadJson, generatedAt: new Date(), mapVersion, memoryVersion },
  });
}

/** Write reflect output to StoryCache + InsightCache pursuit entries. */
export async function applyReflectOutput(
  userId: string,
  reflect: ReflectResponse,
  pursuitIds: string[],
  enrichOptions: PursuitEnrichOptions | undefined,
  mapVersion: string,
  memoryVersion: number,
): Promise<{ insightsWritten: boolean; storyWritten: boolean }> {
  const options = resolvePursuitEnrichOptions(enrichOptions);
  const reading = reflect.reading.trim();

  let storyWritten = false;
  if (reading) {
    const story = sanitizeStoryGeneration({
      schemaVersion: STORY_SCHEMA_VERSION,
      seasonRead: reading,
    });
    await upsertStoryCache(userId, story, mapVersion, memoryVersion);
    storyWritten = true;
  }

  const signals = await loadPursuitSignals(userId, pursuitIds);
  const pursuits: Record<string, PursuitEnrichCachePayload> = {};

  for (const pursuitId of pursuitIds) {
    const entry = reflect.pursuits[pursuitId];
    const signal = signals.get(pursuitId);
    if (!entry || !signal) continue;

    const rawResult: PursuitEnrichResult = {
      clarifiers: (entry.clarifiers ?? []).map((c, index) => ({
        id: "id" in c && typeof c.id === "string" ? c.id : `q-${index + 1}`,
        prompt: "prompt" in c ? String(c.prompt) : "question" in c ? String((c as { question: string }).question) : "",
        options: c.options,
      })).filter((c) => c.prompt.trim() && c.options.length >= 2),
      insight: {
        tone: entry.tone,
        headline: entry.headline,
        body: entry.body,
      },
      suggestedMilestones: shouldSuggestMilestones(signal) ? entry.suggestedMilestones ?? null : null,
    };

    const gated = gateEnrichResult(rawResult, signal, options);
    const payload = toCachePayload(gated);
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
    }
  }

  let insightsWritten = false;
  if (Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes: {}, hubs: {}, pursuits });
    insightsWritten = true;
  }

  return { insightsWritten, storyWritten };
}
