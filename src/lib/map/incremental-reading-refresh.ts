import { generateNodeInsights } from "@/lib/insights/generate-insights";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { generateInsightsAndStory } from "@/lib/map/generate-reading-sync";
import { generateReadingDelta, ReadingDeltaGenerationResponseError } from "@/lib/map/generate-reading-delta";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { refreshPursuitEnrich } from "@/lib/pursuit/generate-pursuit-enrich";
import { pruneArchivedPursuitsFromInsightCache } from "@/lib/insights/merge-insight-cache";
import {
  analyzeReadingDirty,
  clearReadingDirtyForPursuits,
  clearReadingDirtyLedger,
  countEligiblePursuits,
  needsFullStoryRegen,
  shouldUseFullReadingRefresh,
  type ReadingDirtySummary,
} from "@/lib/map/reading-dirty-ledger";
import { generateStory } from "@/lib/story/generate-story";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";
import type { StoryGenerationResult } from "@/lib/story/story-types";
import { GeminiProviderError } from "@/lib/gemini";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { prisma } from "@/lib/prisma";

const STORY_DELTA_MAX_DIRTY_PURSUITS = 12;
const LITE_FIRST_READING_MAX_PURSUITS = 3;
/** Max successful Gemini calls per single ai-sync tap (defer remainder to Continue). */
const MAX_AI_CALLS_PER_SYNC = 2;

function canMakeSyncAiCall(metrics: MapAiSyncMetrics): boolean {
  return metrics.aiCallsCompleted < MAX_AI_CALLS_PER_SYNC;
}

function isGemini429(err: unknown): boolean {
  return err instanceof GeminiProviderError && err.status === 429;
}

export type IncrementalRefreshResult = {
  insightsRefreshed: boolean;
  storyRefreshed: boolean;
  insightsPruned: boolean;
  fullRefresh: boolean;
  incrementalRefresh: boolean;
  backfillCalls: number;
  geminiRateLimited: boolean;
};

function parseStoryPayload(payload: string): StoryGenerationResult | null {
  try {
    return JSON.parse(payload) as StoryGenerationResult;
  } catch {
    return null;
  }
}

function emptyInsightCachePayload(): InsightGenerationResult {
  return {
    global: { greeting: "", sections: [] },
    themes: {},
    hubs: {},
    pursuits: {},
  };
}

async function upsertInsightCache(
  userId: string,
  generated: InsightGenerationResult,
  mapVersion: string,
  memoryVersion: number,
): Promise<void> {
  await prisma.insightCache.upsert({
    where: { userId },
    create: {
      userId,
      globalInsight: JSON.stringify(generated.global),
      themeInsights: generated.themes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      mapVersion,
      memoryVersion,
    },
    update: {
      globalInsight: JSON.stringify(generated.global),
      themeInsights: generated.themes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
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
    create: {
      userId,
      payload: payloadJson,
      mapVersion,
      memoryVersion,
    },
    update: {
      payload: payloadJson,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
}

function canUseStoryDelta(dirty: ReadingDirtySummary): boolean {
  return (
    dirty.pursuitIds.length > 0 &&
    dirty.pursuitIds.length <= STORY_DELTA_MAX_DIRTY_PURSUITS
  );
}

async function shouldUseLiteFirstReading(
  userId: string,
  insightRow: { id: string } | null,
  storyRow: { id: string } | null,
  taxonomyStale: boolean,
): Promise<boolean> {
  if (insightRow || storyRow || taxonomyStale) return false;
  const total = await countEligiblePursuits(userId);
  return total > 0 && total <= LITE_FIRST_READING_MAX_PURSUITS;
}

export async function refreshReadingCachesSmart(
  userId: string,
  mapVersion: string,
  memoryVersion: number,
  options: {
    forceFull?: boolean;
    metrics: MapAiSyncMetrics;
  },
): Promise<IncrementalRefreshResult> {
  const dirtyAnalysis = await analyzeReadingDirty(userId);
  const dirty = dirtyAnalysis;
  options.metrics.dirtyItems = dirty.totalItems;
  options.metrics.dirtyPursuits = dirty.pursuitIds.length;

  const [insightRow, storyRow, taxonomyUser] = await Promise.all([
    prisma.insightCache.findUnique({ where: { userId } }),
    prisma.storyCache.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { taxonomyVersion: true } }),
  ]);

  const missingCache = !insightRow || !storyRow;
  const storyPayloadInvalid = storyRow ? !isCurrentStoryPayload(storyRow.payload) : true;
  const taxonomyStale =
    Boolean(taxonomyUser?.taxonomyVersion) && taxonomyUser?.taxonomyVersion !== TAXONOMY_VERSION;
  const unexplainedDrift =
    dirty.totalItems === 0 &&
    Boolean(insightRow && insightRow.mapVersion !== mapVersion);

  if (
    options.forceFull !== true &&
    (await shouldUseLiteFirstReading(userId, insightRow, storyRow, taxonomyStale))
  ) {
    options.metrics.liteFirstReading = true;
    options.metrics.aiCallsPlanned += 1;
    try {
      const story = await generateStory(userId);
      options.metrics.aiCallsCompleted += 1;
      await Promise.all([
        upsertInsightCache(userId, emptyInsightCachePayload(), mapVersion, memoryVersion),
        upsertStoryCache(userId, story, mapVersion, memoryVersion),
      ]);
      options.metrics.morePending = dirty.totalItems > 0;
      return {
        insightsRefreshed: false,
        storyRefreshed: true,
        insightsPruned: false,
        fullRefresh: false,
        incrementalRefresh: false,
        backfillCalls: 0,
        geminiRateLimited: false,
      };
    } catch (err) {
      if (isGemini429(err)) {
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      }
      throw err;
    }
  }

  const useFull =
    options.forceFull === true ||
    missingCache ||
    storyPayloadInvalid ||
    taxonomyStale ||
    unexplainedDrift ||
    (await shouldUseFullReadingRefresh(userId, dirty.pursuitIds.length));

  if (useFull) {
    options.metrics.fullRefresh = true;
    options.metrics.aiCallsPlanned += 1;
    try {
      const { insights, story } = await generateInsightsAndStory(userId, { skipBackfill: true });
      options.metrics.aiCallsCompleted += 1;
      await Promise.all([
        upsertInsightCache(userId, insights, mapVersion, memoryVersion),
        upsertStoryCache(userId, story, mapVersion, memoryVersion),
      ]);
      await clearReadingDirtyLedger(userId);
      return {
        insightsRefreshed: true,
        storyRefreshed: true,
        insightsPruned: false,
        fullRefresh: true,
        incrementalRefresh: false,
        backfillCalls: 0,
        geminiRateLimited: false,
      };
    } catch (err) {
      if (isGemini429(err)) {
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      }
      throw err;
    }
  }

  options.metrics.incrementalRefresh = true;
  let insightsRefreshed = false;
  let insightsPruned = false;
  let storyRefreshed = false;
  let geminiRateLimited = false;

  if (needsFullStoryRegen(dirtyAnalysis) && canMakeSyncAiCall(options.metrics)) {
    options.metrics.storyFullRegen = true;
    options.metrics.aiCallsPlanned += 1;
    insightsPruned = await pruneArchivedPursuitsFromInsightCache(userId);
    if (dirtyAnalysis.staleDirtyPursuitIds.length > 0) {
      await clearReadingDirtyForPursuits(userId, dirtyAnalysis.staleDirtyPursuitIds);
    }
    try {
      const story = await generateStory(userId);
      options.metrics.aiCallsCompleted += 1;
      await upsertStoryCache(userId, story, mapVersion, memoryVersion);
      storyRefreshed = true;
      await clearReadingDirtyLedger(userId);
      return {
        insightsRefreshed,
        storyRefreshed,
        insightsPruned,
        fullRefresh: false,
        incrementalRefresh: true,
        backfillCalls: 0,
        geminiRateLimited: false,
      };
    } catch (err) {
      if (isGemini429(err)) {
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
        return {
          insightsRefreshed,
          storyRefreshed: false,
          insightsPruned,
          fullRefresh: false,
          incrementalRefresh: true,
          backfillCalls: 0,
          geminiRateLimited: true,
        };
      }
      throw err;
    }
  } else if (needsFullStoryRegen(dirtyAnalysis)) {
    options.metrics.morePending = true;
  }

  if (dirty.activeDirtyPursuitIds.length > 0 && canMakeSyncAiCall(options.metrics)) {
    options.metrics.aiCallsPlanned += Math.min(dirty.activeDirtyPursuitIds.length, 3);
    try {
      const enrichResult = await refreshPursuitEnrich(userId, dirty.activeDirtyPursuitIds);
      options.metrics.aiCallsCompleted += enrichResult.processedIds.length;
      insightsRefreshed = enrichResult.processedIds.length > 0;
      if (enrichResult.remainingIds.length > 0) {
        options.metrics.morePending = true;
      }
      if (enrichResult.processedIds.length > 0) {
        await clearReadingDirtyForPursuits(userId, enrichResult.processedIds);
      }
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else {
        throw err;
      }
    }
  } else if (dirty.activeDirtyPursuitIds.length > 0) {
    options.metrics.morePending = true;
  }

  const deltaDirty: ReadingDirtySummary = {
    ...dirty,
    pursuitIds: dirty.activeDirtyPursuitIds,
  };

  if (
    !geminiRateLimited &&
    (dirty.themeIds.length > 0 || dirty.hubIds.length > 0) &&
    canMakeSyncAiCall(options.metrics)
  ) {
    options.metrics.aiCallsPlanned += 1;
    try {
      const patch = await generateNodeInsights(userId, {
        themeIds: dirty.themeIds,
        hubIds: dirty.hubIds,
        pursuitIds: [],
      });
      options.metrics.aiCallsCompleted += 1;
      options.metrics.backfillCalls += 1;
      if (insightRow) {
        await prisma.insightCache.update({
          where: { userId },
          data: {
            themeInsights: { ...(insightRow.themeInsights as object), ...patch.themes },
            hubInsights: { ...(insightRow.hubInsights as object), ...patch.hubs },
            generatedAt: new Date(),
            mapVersion,
            memoryVersion,
          },
        });
      }
      insightsRefreshed = true;
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else {
        throw err;
      }
    }
  }

  if (
    !geminiRateLimited &&
    storyRow &&
    canUseStoryDelta(deltaDirty) &&
    canMakeSyncAiCall(options.metrics)
  ) {
    const previousStory = parseStoryPayload(storyRow.payload);

    if (previousStory?.seasonRead?.trim()) {
      try {
        options.metrics.aiCallsPlanned += 1;
        const story = await generateReadingDelta(
          userId,
          previousStory,
          storyRow.generatedAt,
          dirtyAnalysis,
          options.metrics,
        );
        options.metrics.aiCallsCompleted += 1;
        await upsertStoryCache(userId, story, mapVersion, memoryVersion);
        storyRefreshed = true;
      } catch (err) {
        if (
          err instanceof ReadingDeltaGenerationResponseError &&
          canMakeSyncAiCall(options.metrics)
        ) {
          try {
            options.metrics.aiCallsPlanned += 1;
            const story = await generateStory(userId);
            options.metrics.aiCallsCompleted += 1;
            await upsertStoryCache(userId, story, mapVersion, memoryVersion);
            storyRefreshed = true;
          } catch (inner) {
            if (isGemini429(inner)) {
              geminiRateLimited = true;
              options.metrics.rateLimited = true;
              options.metrics.morePending = true;
            } else {
              throw inner;
            }
          }
        } else if (err instanceof ReadingDeltaGenerationResponseError) {
          options.metrics.morePending = true;
        } else if (isGemini429(err)) {
          geminiRateLimited = true;
          options.metrics.rateLimited = true;
          options.metrics.morePending = true;
        } else {
          throw err;
        }
      }
    }
  }

  if (
    !geminiRateLimited &&
    !storyRefreshed &&
    dirty.activeDirtyPursuitIds.length > 0 &&
    canMakeSyncAiCall(options.metrics)
  ) {
    options.metrics.aiCallsPlanned += 1;
    try {
      const story = await generateStory(userId);
      options.metrics.aiCallsCompleted += 1;
      await upsertStoryCache(userId, story, mapVersion, memoryVersion);
      storyRefreshed = true;
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else {
        throw err;
      }
    }
  } else if (!storyRefreshed && dirty.activeDirtyPursuitIds.length > 0) {
    options.metrics.morePending = true;
  }

  if (insightsRefreshed || storyRefreshed) {
    if (!options.metrics.morePending) {
      await clearReadingDirtyLedger(userId);
    }
  }

  return {
    insightsRefreshed,
    storyRefreshed,
    insightsPruned,
    fullRefresh: false,
    incrementalRefresh: true,
    backfillCalls: options.metrics.backfillCalls,
    geminiRateLimited,
  };
}
