import { generateNodeInsights } from "@/lib/insights/generate-insights";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { refreshPursuitInsights } from "@/lib/insights/merge-insight-cache";
import { generateInsightsAndStory } from "@/lib/map/generate-reading-sync";
import { generateReadingDelta, ReadingDeltaGenerationResponseError } from "@/lib/map/generate-reading-delta";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  clearReadingDirtyLedger,
  listReadingDirtySummary,
  shouldUseFullReadingRefresh,
  type ReadingDirtySummary,
} from "@/lib/map/reading-dirty-ledger";
import { generateStory } from "@/lib/story/generate-story";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";
import type { StoryGenerationResult } from "@/lib/story/story-types";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { prisma } from "@/lib/prisma";

const STORY_DELTA_MAX_DIRTY_PURSUITS = 12;

export type IncrementalRefreshResult = {
  insightsRefreshed: boolean;
  storyRefreshed: boolean;
  fullRefresh: boolean;
  incrementalRefresh: boolean;
  backfillCalls: number;
};

function parseStoryPayload(payload: string): StoryGenerationResult | null {
  try {
    return JSON.parse(payload) as StoryGenerationResult;
  } catch {
    return null;
  }
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
    dirty.pursuitIds.length <= STORY_DELTA_MAX_DIRTY_PURSUITS &&
    !dirty.hasGlobal
  );
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
  const dirty = await listReadingDirtySummary(userId);
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

  const useFull =
    options.forceFull === true ||
    missingCache ||
    storyPayloadInvalid ||
    taxonomyStale ||
    unexplainedDrift ||
    dirty.hasGlobal ||
    (await shouldUseFullReadingRefresh(userId, dirty.pursuitIds.length));

  if (useFull) {
    options.metrics.fullRefresh = true;
    options.metrics.aiCallsPlanned += 1;
    const { insights, story } = await generateInsightsAndStory(userId);
    options.metrics.aiCallsCompleted += 1;
    await Promise.all([
      upsertInsightCache(userId, insights, mapVersion, memoryVersion),
      upsertStoryCache(userId, story, mapVersion, memoryVersion),
    ]);
    await clearReadingDirtyLedger(userId);
    return {
      insightsRefreshed: true,
      storyRefreshed: true,
      fullRefresh: true,
      incrementalRefresh: false,
      backfillCalls: 0,
    };
  }

  options.metrics.incrementalRefresh = true;
  let insightsRefreshed = false;
  let storyRefreshed = false;

  if (dirty.pursuitIds.length > 0) {
    options.metrics.aiCallsPlanned += 1;
    await refreshPursuitInsights(userId, dirty.pursuitIds);
    options.metrics.aiCallsCompleted += 1;
    insightsRefreshed = true;

    if (dirty.themeIds.length > 0 || dirty.hubIds.length > 0) {
      options.metrics.aiCallsPlanned += 1;
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
    }
  }

  if (storyRow && canUseStoryDelta(dirty)) {
    const previousStory = parseStoryPayload(storyRow.payload);

    if (previousStory?.seasonRead?.trim()) {
      try {
        options.metrics.aiCallsPlanned += 1;
        const story = await generateReadingDelta(
          userId,
          previousStory,
          storyRow.generatedAt,
          dirty,
        );
        options.metrics.aiCallsCompleted += 1;
        await upsertStoryCache(userId, story, mapVersion, memoryVersion);
        storyRefreshed = true;
      } catch (err) {
        if (err instanceof ReadingDeltaGenerationResponseError) {
          options.metrics.aiCallsPlanned += 1;
          const story = await generateStory(userId);
          options.metrics.aiCallsCompleted += 1;
          await upsertStoryCache(userId, story, mapVersion, memoryVersion);
          storyRefreshed = true;
        } else {
          throw err;
        }
      }
    }
  }

  if (!storyRefreshed && dirty.pursuitIds.length > 0) {
    options.metrics.aiCallsPlanned += 1;
    const story = await generateStory(userId);
    options.metrics.aiCallsCompleted += 1;
    await upsertStoryCache(userId, story, mapVersion, memoryVersion);
    storyRefreshed = true;
  }

  if (insightsRefreshed || storyRefreshed) {
    await clearReadingDirtyLedger(userId);
  }

  if (insightRow && !insightsRefreshed) {
    await prisma.insightCache.update({
      where: { userId },
      data: { mapVersion, memoryVersion },
    });
  }

  return {
    insightsRefreshed,
    storyRefreshed,
    fullRefresh: false,
    incrementalRefresh: true,
    backfillCalls: options.metrics.backfillCalls,
  };
}
