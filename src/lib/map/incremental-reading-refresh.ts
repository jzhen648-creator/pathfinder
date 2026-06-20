import {
  generateNodeInsights,
  InsightGenerationResponseError,
} from "@/lib/insights/generate-insights";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { generateInsightsAndStory, ReadingSyncGenerationResponseError } from "@/lib/map/generate-reading-sync";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { canMakeSyncGeminiCall } from "@/lib/map/sync-gemini-budget";
import { refreshPursuitEnrich } from "@/lib/pursuit/generate-pursuit-enrich";
import {
  DEFAULT_PURSUIT_ENRICH_OPTIONS,
  type PursuitEnrichOptions,
} from "@/lib/pursuit/enrich-options";
import { pruneArchivedPursuitsFromInsightCache, gateThemeInsightsPatch } from "@/lib/insights/merge-insight-cache";
import {
  analyzeReadingDirty,
  clearReadingDirtyForPursuits,
  clearReadingDirtyLedger,
  shouldUseFullReadingRefresh,
  shouldUseCreateBurstFullRefresh,
} from "@/lib/map/reading-dirty-ledger";
import { GeminiProviderError } from "@/lib/gemini";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { prisma } from "@/lib/prisma";

function canMakeSyncAiCall(metrics: MapAiSyncMetrics): boolean {
  return canMakeSyncGeminiCall(metrics);
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

async function upsertInsightCache(
  userId: string,
  generated: InsightGenerationResult,
  mapVersion: string,
  memoryVersion: number,
): Promise<void> {
  const gatedThemes = await gateThemeInsightsPatch(userId, generated.themes);
  await prisma.insightCache.upsert({
    where: { userId },
    create: {
      userId,
      globalInsight: JSON.stringify(generated.global),
      themeInsights: gatedThemes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      mapVersion,
      memoryVersion,
    },
    update: {
      globalInsight: JSON.stringify(generated.global),
      themeInsights: gatedThemes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
}

async function runPursuitEnrichLoop(
  userId: string,
  pursuitIds: string[],
  options: {
    metrics: MapAiSyncMetrics;
    geminiRateLimited: boolean;
    enrichOptions?: PursuitEnrichOptions;
  },
): Promise<{ insightsRefreshed: boolean; geminiRateLimited: boolean; remainingIds: string[] }> {
  let insightsRefreshed = false;
  let geminiRateLimited = options.geminiRateLimited;
  let remainingToEnrich = [...new Set(pursuitIds.filter(Boolean))];

  while (remainingToEnrich.length > 0 && canMakeSyncAiCall(options.metrics) && !geminiRateLimited) {
    options.metrics.aiCallsPlanned += 1;
    try {
      const enrichResult = await refreshPursuitEnrich(
        userId,
        remainingToEnrich,
        options.enrichOptions ?? DEFAULT_PURSUIT_ENRICH_OPTIONS,
      );
      options.metrics.aiCallsCompleted += enrichResult.geminiCallsMade;
      if (enrichResult.geminiCallsMade > 0 && enrichResult.processedIds.length === 0) {
        options.metrics.enrichErrors.push(
          "Pursuit insight could not be saved — tap Finish to retry.",
        );
      }
      insightsRefreshed = insightsRefreshed || enrichResult.processedIds.length > 0;
      if (enrichResult.processedIds.length > 0) {
        await clearReadingDirtyForPursuits(userId, enrichResult.processedIds);
      }
      remainingToEnrich = enrichResult.remainingIds;
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else if (err instanceof InsightGenerationResponseError) {
        console.warn("[incremental-reading-refresh] pursuit enrich failed", err.message);
        options.metrics.enrichErrors.push(err.message);
        options.metrics.morePending = true;
      } else {
        throw err;
      }
      break;
    }
  }

  if (remainingToEnrich.length > 0) {
    options.metrics.morePending = true;
  }
  options.metrics.pendingInsightCount = remainingToEnrich.length;

  return { insightsRefreshed, geminiRateLimited, remainingIds: remainingToEnrich };
}

/** Legacy non-reflect ai-sync path — insight cache + pursuit enrich only. */
export async function refreshReadingCachesSmart(
  userId: string,
  mapVersion: string,
  memoryVersion: number,
  options: {
    forceFull?: boolean;
    force?: boolean;
    metrics: MapAiSyncMetrics;
    enrichOptions?: PursuitEnrichOptions;
  },
): Promise<IncrementalRefreshResult> {
  const dirtyAnalysis = await analyzeReadingDirty(userId);
  options.metrics.dirtyItems = dirtyAnalysis.totalItems;
  options.metrics.dirtyPursuits = dirtyAnalysis.pursuitIds.length;

  const [insightRow, taxonomyUser] = await Promise.all([
    prisma.insightCache.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { taxonomyVersion: true } }),
  ]);

  const taxonomyStale =
    Boolean(taxonomyUser?.taxonomyVersion) && taxonomyUser?.taxonomyVersion !== TAXONOMY_VERSION;

  let insightsRefreshed = false;
  let geminiRateLimited = false;
  let fullRefresh = false;
  let incrementalRefresh = false;
  let backfillCalls = 0;

  const insightsPruned = await pruneArchivedPursuitsFromInsightCache(userId);

  const needsFullRefresh =
    options.forceFull === true ||
    taxonomyStale ||
    !insightRow ||
    insightRow.mapVersion !== mapVersion ||
    insightRow.memoryVersion !== memoryVersion ||
    (await shouldUseCreateBurstFullRefresh(userId)) ||
    (await shouldUseFullReadingRefresh(userId, dirtyAnalysis.activeDirtyPursuitIds.length));

  if (needsFullRefresh && canMakeSyncAiCall(options.metrics)) {
    options.metrics.aiCallsPlanned += 1;
    fullRefresh = true;
    try {
      const { insights } = await generateInsightsAndStory(userId);
      options.metrics.aiCallsCompleted += 1;
      await upsertInsightCache(userId, insights, mapVersion, memoryVersion);
      insightsRefreshed = true;
      await clearReadingDirtyLedger(userId);
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else if (
        err instanceof ReadingSyncGenerationResponseError ||
        err instanceof InsightGenerationResponseError
      ) {
        console.warn("[incremental-reading-refresh] full insight refresh failed", err.message);
        options.metrics.morePending = true;
      } else {
        throw err;
      }
    }
  } else if (dirtyAnalysis.activeDirtyPursuitIds.length > 0 && canMakeSyncAiCall(options.metrics)) {
    incrementalRefresh = true;
    options.metrics.aiCallsPlanned += 1;
    try {
      const partial = await generateNodeInsights(userId, {
        pursuitIds: dirtyAnalysis.activeDirtyPursuitIds,
      });
      options.metrics.aiCallsCompleted += 1;
      backfillCalls += 1;
      if (insightRow) {
        const merged: InsightGenerationResult = {
          global: JSON.parse(insightRow.globalInsight) as InsightGenerationResult["global"],
          themes: { ...(insightRow.themeInsights as InsightGenerationResult["themes"]), ...partial.themes },
          hubs: { ...(insightRow.hubInsights as InsightGenerationResult["hubs"]), ...partial.hubs },
          pursuits: {
            ...(insightRow.pursuitInsights as InsightGenerationResult["pursuits"]),
            ...partial.pursuits,
          },
        };
        await upsertInsightCache(userId, merged, mapVersion, memoryVersion);
      } else {
        options.metrics.morePending = true;
      }
      insightsRefreshed = true;
      await clearReadingDirtyForPursuits(userId, dirtyAnalysis.activeDirtyPursuitIds);
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
        options.metrics.morePending = true;
      } else if (err instanceof InsightGenerationResponseError) {
        console.warn("[incremental-reading-refresh] incremental insight refresh failed", err.message);
        options.metrics.morePending = true;
      } else {
        throw err;
      }
    }
  }

  if (dirtyAnalysis.activeDirtyPursuitIds.length > 0) {
    const enrich = await runPursuitEnrichLoop(userId, dirtyAnalysis.activeDirtyPursuitIds, {
      metrics: options.metrics,
      geminiRateLimited,
      enrichOptions: options.enrichOptions,
    });
    insightsRefreshed = insightsRefreshed || enrich.insightsRefreshed;
    geminiRateLimited = enrich.geminiRateLimited;
  }

  if (options.force && !insightsRefreshed && canMakeSyncAiCall(options.metrics)) {
    options.metrics.aiCallsPlanned += 1;
    try {
      const { insights } = await generateInsightsAndStory(userId);
      options.metrics.aiCallsCompleted += 1;
      await upsertInsightCache(userId, insights, mapVersion, memoryVersion);
      insightsRefreshed = true;
      await clearReadingDirtyLedger(userId);
    } catch (err) {
      if (isGemini429(err)) {
        geminiRateLimited = true;
        options.metrics.rateLimited = true;
      } else if (
        err instanceof ReadingSyncGenerationResponseError ||
        err instanceof InsightGenerationResponseError
      ) {
        console.warn("[incremental-reading-refresh] forced refresh failed", err.message);
      } else {
        throw err;
      }
    }
  }

  return {
    insightsRefreshed,
    storyRefreshed: false,
    insightsPruned,
    fullRefresh,
    incrementalRefresh,
    backfillCalls,
    geminiRateLimited,
  };
}
