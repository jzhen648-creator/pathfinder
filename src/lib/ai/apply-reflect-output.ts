import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  resolvePursuitInsightTone,
  type PursuitToneGoalInput,
} from "@/lib/insights/resolve-pursuit-insight-tone";
import {
  filterClarifiersAgainstMilestones,
  milestonesToGroundingInput,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import {
  gateEnrichResult,
  gatePursuitComparison,
  gateThemeCombined,
  gateThemeContextual,
  resolveQuickQuestionsQuietUntilAfterGeneration,
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitSignalsByTheme } from "@/lib/pursuit/load-pursuit-signals";
import {
  applyQuestionSlotToResult,
  loadRelationshipPeerIdsForGoal,
  pickQuestionSlotForPursuit,
  type QuestionSlotMessageContext,
} from "@/lib/pursuit/pick-question-slot";
import {
  enrichAnswersSchema,
  type Clarifier,
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import { validateSeasonReadAgainstPursuits } from "@/lib/story/validate-season-read";
import { STORY_SCHEMA_VERSION, type StoryGenerationResult } from "@/lib/story/story-types";
import { prisma } from "@/lib/prisma";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";

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

function normalizeMilestoneTitle(title: string): string {
  return title.trim().toLowerCase();
}

function stripSuggestionsAlreadyOnMap<T extends { title: string }>(
  suggestions: T[] | null | undefined,
  mapMilestones: Array<{ title: string }>,
): T[] | null {
  if (!suggestions?.length) return suggestions ?? null;
  const onMap = new Set(mapMilestones.map((milestone) => normalizeMilestoneTitle(milestone.title)));
  const filtered = suggestions.filter(
    (suggestion) => !onMap.has(normalizeMilestoneTitle(suggestion.title)),
  );
  return filtered.length > 0 ? filtered : null;
}

/** Prefer fresh reflect output; when the model omits suggestions, keep the prior cache. */
export function resolveReflectSuggestedMilestones<T extends { title: string }>(input: {
  fresh: T[] | null | undefined;
  cached: T[] | undefined;
  mapMilestones: Array<{ title: string }>;
  allowed: boolean;
}): T[] | null {
  if (!input.allowed) return null;

  const fresh = stripSuggestionsAlreadyOnMap(
    dedupeSuggestedMilestones(input.fresh ?? null),
    input.mapMilestones,
  );
  if (fresh?.length) return fresh;

  return stripSuggestionsAlreadyOnMap(
    dedupeSuggestedMilestones(input.cached ?? null),
    input.mapMilestones,
  );
}

function normalizeReflectClarifier(raw: unknown, index: number): Clarifier | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const prompt =
    typeof c.prompt === "string"
      ? c.prompt
      : typeof c.question === "string"
        ? c.question
        : "";
  const options = Array.isArray(c.options)
    ? c.options.filter((o): o is string => typeof o === "string")
    : [];
  if (!prompt.trim() || options.length < 2) return null;
  return {
    id: typeof c.id === "string" && c.id.trim() ? c.id : `q-${index + 1}`,
    prompt: prompt.trim(),
    options,
    ...(typeof c.kind === "string" ? { kind: c.kind as Clarifier["kind"] } : {}),
    ...(typeof c.peerGoalId === "string" ? { peerGoalId: c.peerGoalId } : {}),
    ...(typeof c.suggestedTitle === "string" ? { suggestedTitle: c.suggestedTitle } : {}),
    ...(typeof c.suggestedCategoryId === "string"
      ? { suggestedCategoryId: c.suggestedCategoryId }
      : {}),
    ...(typeof c.suggestedThemeId === "string" ? { suggestedThemeId: c.suggestedThemeId } : {}),
  };
}

async function loadPursuitToneGoals(
  userId: string,
  pursuitIds: string[],
): Promise<Map<string, PursuitToneGoalInput & { id: string; themeId: string | null }>> {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      themeId: true,
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

function toCachePayload(
  result: PursuitEnrichResult,
  quickQuestionsQuietUntil?: string,
): PursuitEnrichCachePayload | null {
  const hasClarifiers = result.clarifiers.length > 0;
  const hasMilestones = (result.suggestedMilestones?.length ?? 0) > 0;
  const hasInsight = Boolean(result.insight?.headline?.trim());

  if (!hasClarifiers && !hasMilestones && !hasInsight) return null;

  const clarifiers = hasClarifiers ? result.clarifiers : undefined;
  const suggestedMilestones = hasMilestones ? result.suggestedMilestones ?? undefined : undefined;
  const quietField = quickQuestionsQuietUntil ? { quickQuestionsQuietUntil } : {};

  if (hasInsight && result.insight) {
    return {
      ...result.insight,
      clarifiers,
      suggestedMilestones,
      ...quietField,
    };
  }

  return {
    tone: "context",
    headline: "Help Pathfinder read this pursuit",
    body: "Answer a quick question below — then update your AI reading on Insights.",
    clarifiers,
    suggestedMilestones,
    ...quietField,
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
  const existingCache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  const cachedPursuits = parsePursuitInsightRecord(existingCache?.pursuitInsights, "pursuit");
  const siblingTitlesByTheme = new Map<string, Array<{ id: string; title: string }>>();
  for (const goal of toneGoals.values()) {
    const themeId = goal.themeId ?? "becoming";
    const list = siblingTitlesByTheme.get(themeId) ?? [];
    list.push({ id: goal.id, title: goal.title });
    siblingTitlesByTheme.set(themeId, list);
  }
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

    const enrichAnswersParsed = enrichAnswersSchema.safeParse(goal.enrichAnswers);
    const enrichAnswers = enrichAnswersParsed.success ? enrichAnswersParsed.data : [];
    const previousQuietUntil = cachedPursuits[pursuitId]?.quickQuestionsQuietUntil;
    const milestonesAllowed = shouldSuggestMilestones(signal);
    const suggestedMilestones = resolveReflectSuggestedMilestones({
      fresh: entry.suggestedMilestones ?? null,
      cached: cachedPursuits[pursuitId]?.suggestedMilestones,
      mapMilestones: goal.milestones,
      allowed: milestonesAllowed,
    });

    const rawResult: PursuitEnrichResult = {
      clarifiers: filterClarifiersAgainstMilestones(
        (entry.clarifiers ?? [])
          .map((c, index) => normalizeReflectClarifier(c, index))
          .filter((c): c is Clarifier => c != null),
        milestonesToGroundingInput(goal.milestones),
      ),
      insight: {
        tone: resolvePursuitInsightTone(goal, now),
        headline: entry.headline,
        body: entry.body,
        ...(entry.fromMap?.trim() ? { fromMap: entry.fromMap.trim() } : {}),
        ...(comparison ? { comparison } : {}),
      },
      suggestedMilestones,
    };

    const gated = gateEnrichResult(rawResult, signal, options, {
      status: goal.status ?? "ACTIVE",
      quickQuestionsQuietUntil: previousQuietUntil,
    });
    const themeId = goal.themeId ?? "becoming";
    const siblingPursuits = (siblingTitlesByTheme.get(themeId) ?? []).filter(
      (s) => s.id !== pursuitId,
    );
    const existingRelationshipPeerIds = await loadRelationshipPeerIdsForGoal(userId, pursuitId);
    const slotContext: QuestionSlotMessageContext = {
      signal,
      status: goal.status ?? "ACTIVE",
      completedAt: goal.completedAt ?? null,
      significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
      enrichAnswers,
      quickQuestionsQuietUntil: previousQuietUntil,
      siblingGoalIds: siblingPursuits.map((s) => s.id),
      existingRelationshipPeerIds,
      enrichOptions: options,
      siblingPursuits,
    };
    const slot = pickQuestionSlotForPursuit(slotContext);
    const slotted = applyQuestionSlotToResult(gated, slotContext);
    const quickQuestionsQuietUntil = resolveQuickQuestionsQuietUntilAfterGeneration({
      slot,
      clarifiers: slotted.clarifiers,
      previousQuietUntil,
    });
    const payload = toCachePayload(slotted, quickQuestionsQuietUntil);
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
