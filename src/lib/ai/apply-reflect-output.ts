import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  resolvePursuitInsightTone,
  type PursuitToneGoalInput,
} from "@/lib/insights/resolve-pursuit-insight-tone";
import {
  gateEnrichResult,
  gatePursuitComparison,
  gateThemeCombined,
  gateThemeContextual,
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitSignalsByTheme } from "@/lib/pursuit/load-pursuit-signals";
import {
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import { validateSeasonReadAgainstPursuits } from "@/lib/story/validate-season-read";
import { STORY_SCHEMA_VERSION, type StoryGenerationResult } from "@/lib/story/story-types";
import { prisma } from "@/lib/prisma";

function dedupeMilestoneTitles<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @internal Exported for vitest — strips duplicate milestone titles from reflect output. */
export function dedupeSuggestedMilestones<T extends { title: string }>(
  suggestions: T[] | null | undefined,
): T[] | null {
  if (!suggestions?.length) return suggestions ?? null;
  const unique = dedupeMilestoneTitles(suggestions);
  return unique.length > 0 ? unique : null;
}

async function loadPursuitToneGoals(
  userId: string,
  pursuitIds: string[],
): Promise<Map<string, PursuitToneGoalInput>> {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      significance: true,
      targetAmount: true,
      currentAmount: true,
      completedAt: true,
      milestones: {
        select: { id: true, title: true, completedAt: true },
        orderBy: { position: "asc" },
      },
    },
  });
  return new Map(goals.map((goal) => [goal.id, goal]));
}

async function loadThemePursuitSignals(
  userId: string,
  themeIds: string[],
): Promise<Map<string, PursuitSignal[]>> {
  return loadPursuitSignalsByTheme(userId, themeIds);
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
    tone: "context",
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
    const statusRows = await prisma.goal.findMany({
      where: { userId, goalType: { notIn: ["moment", "event"] } },
      select: { title: true, status: true },
    });
    validateSeasonReadAgainstPursuits(
      story.seasonRead,
      statusRows.map((row) => ({ title: row.title, status: row.status })),
    );
    await upsertStoryCache(userId, story, mapVersion, memoryVersion);
    storyWritten = true;
  }

  const toneGoals = await loadPursuitToneGoals(userId, pursuitIds);
  const themeIds = Object.keys(reflect.themes ?? {});
  const themeSignals = await loadThemePursuitSignals(userId, themeIds);
  const pursuits: Record<string, PursuitEnrichCachePayload> = {};
  const themes: Record<string, InsightLevelPayload> = {};
  const now = Date.now();

  for (const [themeId, entry] of Object.entries(reflect.themes ?? {})) {
    if (!entry.oneLiner?.trim() && !entry.reflective?.trim()) continue;
    themes[themeId] = {
      tone: entry.tone,
      oneLiner: entry.oneLiner.trim(),
      reflective: entry.reflective.trim(),
      contextual: gateThemeContextual(
        entry.contextual?.trim() ?? "",
        themeSignals.get(themeId) ?? [],
      ),
      combined: gateThemeCombined(
        entry.combined?.trim() ?? "",
        themeSignals.get(themeId) ?? [],
      ),
    };
  }

  for (const pursuitId of pursuitIds) {
    const entry = reflect.pursuits[pursuitId];
    const goal = toneGoals.get(pursuitId);
    if (!entry || !goal) continue;

    const signal = pursuitSignalFromGoal(goal);
    const comparison = gatePursuitComparison(entry.comparison?.trim() ?? "", signal);

    const rawResult: PursuitEnrichResult = {
      clarifiers: (entry.clarifiers ?? []).map((c, index) => ({
        id: "id" in c && typeof c.id === "string" ? c.id : `q-${index + 1}`,
        prompt: "prompt" in c ? String(c.prompt) : "question" in c ? String((c as { question: string }).question) : "",
        options: c.options,
      })).filter((c) => c.prompt.trim() && c.options.length >= 2),
      insight: {
        tone: resolvePursuitInsightTone(goal, now),
        headline: entry.headline,
        body: entry.body,
        ...(entry.fromMap?.trim() ? { fromMap: entry.fromMap.trim() } : {}),
        ...(comparison ? { comparison } : {}),
      },
      suggestedMilestones: shouldSuggestMilestones(signal)
        ? dedupeSuggestedMilestones(entry.suggestedMilestones ?? null)
        : null,
    };

    const gated = gateEnrichResult(rawResult, signal, options);
    const payload = toCachePayload(gated);
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
    }
  }

  let insightsWritten = false;
  if (Object.keys(themes).length > 0 || Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes, hubs: {}, pursuits });
    insightsWritten = true;
  }

  return { insightsWritten, storyWritten };
}
