import { AiUserRateLimitError } from "@/lib/ai/ai-user-rate-limit";

import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";

import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";

import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

import {

  discardDeferredMemoryUpdates,

  flushDeferredMemoryUpdates,

} from "@/lib/memory/deferred-memory-updates";

import { emptyMapAiSyncMetrics, type MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

import { refreshReadingCachesSmart } from "@/lib/map/incremental-reading-refresh";

import {
  checkReadingDeliveryGate,
  recordReadingDelivery,
} from "@/lib/map/reading-delivery-cadence";

import {

  clearReadingDirtyLedger,

  listReadingDirtySummary,

  markGlobalReadingDirty,

} from "@/lib/map/reading-dirty-ledger";

import { prisma } from "@/lib/prisma";

import { isCurrentStoryPayload, storyCacheToPayload } from "@/lib/story/parse-story-cache";

import { TAXONOMY_VERSION } from "@/lib/taxonomy";

import {

  countPendingCaptures,

  digestPendingCapturesBounded,

} from "@/lib/stream-pursuit-apply";



export class MapAiSyncRateLimitError extends Error {

  readonly retryAfterMs: number;

  readonly partialResult: MapAiSyncResult;



  constructor(retryAfterMs: number, partialResult: MapAiSyncResult) {

    super("AI rate limit — try again in a moment.");

    this.name = "MapAiSyncRateLimitError";

    this.retryAfterMs = retryAfterMs;

    this.partialResult = partialResult;

  }

}



export type MapAiSyncResult = {

  ok: true;

  mapVersion: string;

  skipped: boolean;

  digested: { runs: number; failed: number; errors: string[] };

  insights: { refreshed: boolean; skipped: boolean };

  story: { refreshed: boolean; skipped: boolean };

  progress: {

    startedWork: boolean;

    morePending: boolean;

    retryableAt: string | null;

    deliveryBlocked: boolean;

    pendingInsightCount: number;

  };

  metrics: MapAiSyncMetrics;

};



async function resolveVersions(userId: string) {

  const [mapVersion, memoryVersion, user] = await Promise.all([

    computeMapVersion(userId),

    getMemoryVersion(userId),

    prisma.user.findUnique({

      where: { id: userId },

      select: { taxonomyVersion: true },

    }),

  ]);

  return {

    mapVersion,

    memoryVersion,

    taxonomyVersion: user?.taxonomyVersion ?? null,

  };

}



function insightCacheStale(

  row: { mapVersion: string; memoryVersion: number },

  mapVersion: string,

  memoryVersion: number,

): boolean {

  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;

}



function storyCacheStale(

  row: { mapVersion: string; memoryVersion: number; payload: string },

  mapVersion: string,

  memoryVersion: number,

  taxonomyVersion: string | null,

): boolean {

  if (row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion) return true;

  if (taxonomyVersion && taxonomyVersion !== TAXONOMY_VERSION) return true;

  return !isCurrentStoryPayload(row.payload);

}



function buildBaseResult(

  mapVersion: string,

  metrics: MapAiSyncMetrics,

  digested: MapAiSyncResult["digested"],

): MapAiSyncResult {

  return {

    ok: true,

    mapVersion,

    skipped: true,

    digested,

    insights: { refreshed: false, skipped: true },

    story: { refreshed: false, skipped: true },

    progress: {

      startedWork: metrics.startedWork,

      morePending: metrics.morePending,

      retryableAt: metrics.rateLimited

        ? new Date(Date.now() + 60_000).toISOString()

        : metrics.deliveryBlocked && metrics.deliveryRetryAfterMs > 0

          ? new Date(Date.now() + metrics.deliveryRetryAfterMs).toISOString()

          : null,

      deliveryBlocked: metrics.deliveryBlocked,

      pendingInsightCount: metrics.pendingInsightCount,

    },

    metrics,

  };

}



const syncChains = new Map<string, Promise<unknown>>();

async function runMapAiSyncInner(

  userId: string,

  options?: { force?: boolean },

): Promise<MapAiSyncResult> {

  if (!hasGeminiKey()) {

    throw new GeminiNotConfiguredError();

  }



  const force = options?.force === true;

  const metrics = emptyMapAiSyncMetrics();

  const pendingBefore = await countPendingCaptures(userId);



  let digested = {

    runs: 0,

    failed: 0,

    errors: [] as string[],

  };



  if (pendingBefore > 0) {

    metrics.startedWork = true;

    metrics.aiCallsPlanned += Math.min(pendingBefore, 5);

    const digestResult = await digestPendingCapturesBounded(userId);

    digested = {

      runs: digestResult.processed,

      failed: digestResult.failed,

      errors: digestResult.errors,

    };

    metrics.digestRunsProcessed = digestResult.processed;

    metrics.digestRunsFailed = digestResult.failed;

    metrics.digestRunsRemaining = digestResult.remaining;

    metrics.morePending = digestResult.remaining > 0;

    metrics.memoryUpdatesDeferred = digestResult.memoryTextsDeferred;

    metrics.aiCallsCompleted += digestResult.processed;

    metrics.rateLimited = digestResult.rateLimited;



    if (digestResult.rateLimited) {

      discardDeferredMemoryUpdates(userId);

      const { mapVersion } = await resolveVersions(userId);

      const partial = buildBaseResult(mapVersion, metrics, digested);

      throw new MapAiSyncRateLimitError(60_000, partial);

    }

  }



  const { mapVersion, memoryVersion, taxonomyVersion } = await resolveVersions(userId);



  const [insightRow, storyRow, dirtySummary] = await Promise.all([

    prisma.insightCache.findUnique({ where: { userId } }),

    prisma.storyCache.findUnique({ where: { userId } }),

    listReadingDirtySummary(userId),

  ]);



  metrics.dirtyItems = dirtySummary.totalItems;

  metrics.dirtyPursuits = dirtySummary.pursuitIds.length;



  const insightsStale =

    !insightRow || insightCacheStale(insightRow, mapVersion, memoryVersion);

  const storyStale =

    !storyRow ||

    storyCacheStale(storyRow, mapVersion, memoryVersion, taxonomyVersion);



  const readingWorkNeeded =

    force ||

    digested.runs > 0 ||

    insightsStale ||

    storyStale ||

    dirtySummary.totalItems > 0;



  if (!readingWorkNeeded && pendingBefore === 0) {

    return buildBaseResult(mapVersion, metrics, digested);

  }



  const enrichOnlyFollowUp =
    !insightsStale &&
    !storyStale &&
    dirtySummary.pursuitIds.length > 0;



  const deliveryGate = await checkReadingDeliveryGate(userId, {
    force: force || enrichOnlyFollowUp,
    hasStoryCache: Boolean(storyRow),
  });

  if (!deliveryGate.allowed && readingWorkNeeded) {
    metrics.deliveryBlocked = true;
    metrics.deliveryRetryAfterMs = deliveryGate.retryAfterMs;
    metrics.morePending = dirtySummary.totalItems > 0 || dirtySummary.pursuitIds.length > 0;
    metrics.pendingInsightCount = dirtySummary.pursuitIds.length;
    return buildBaseResult(mapVersion, metrics, digested);
  }



  if (digested.failed > 0 && digested.runs === 0) {

    discardDeferredMemoryUpdates(userId);

    return buildBaseResult(mapVersion, metrics, digested);

  }



  metrics.startedWork = true;



  let insightsRefreshed = false;

  let storyRefreshed = false;



  try {

    const refresh = await refreshReadingCachesSmart(userId, mapVersion, memoryVersion, {

      forceFull: false,

      metrics,

    });

    insightsRefreshed = refresh.insightsRefreshed || refresh.insightsPruned;

    storyRefreshed = refresh.storyRefreshed;

    metrics.fullRefresh = refresh.fullRefresh;

    metrics.incrementalRefresh = refresh.incrementalRefresh;

    metrics.backfillCalls = refresh.backfillCalls;

    if (refresh.geminiRateLimited) {
      metrics.rateLimited = true;
      metrics.morePending = true;
    }

    await flushDeferredMemoryUpdates(userId);

    metrics.memoryUpdatesFlushed = metrics.memoryUpdatesDeferred;

  } catch (err) {

    discardDeferredMemoryUpdates(userId);

    if (err instanceof AiUserRateLimitError) {

      metrics.rateLimited = true;

      const partial = buildBaseResult(mapVersion, metrics, digested);

      partial.skipped = false;

      throw new MapAiSyncRateLimitError(err.retryAfterMs, partial);

    }

    throw err;

  }



  if (!insightsRefreshed && !storyRefreshed && metrics.rateLimited) {

    discardDeferredMemoryUpdates(userId);

    const partial = buildBaseResult(mapVersion, metrics, digested);

    partial.skipped = false;

    throw new MapAiSyncRateLimitError(60_000, partial);

  }



  if (insightsRefreshed) {

    const row = await prisma.insightCache.findUnique({ where: { userId } });

    if (!row || !insightCacheToPayload(row, false)) {

      throw new Error("Failed to store insights after sync");

    }

  }

  if (storyRefreshed) {

    const row = await prisma.storyCache.findUnique({ where: { userId } });

    if (!row || !storyCacheToPayload(row, false)) {

      throw new Error("Failed to store story after sync");

    }

  }



  if ((insightsRefreshed || storyRefreshed) && !metrics.morePending) {

    const fresh = await resolveVersions(userId);

    await Promise.all([

      insightsRefreshed

        ? prisma.insightCache.update({

            where: { userId },

            data: { mapVersion: fresh.mapVersion, memoryVersion: fresh.memoryVersion },

          })

        : Promise.resolve(),

      storyRefreshed

        ? prisma.storyCache.update({

            where: { userId },

            data: { mapVersion: fresh.mapVersion, memoryVersion: fresh.memoryVersion },

          })

        : Promise.resolve(),

    ]);

    await clearReadingDirtyLedger(userId);

  } else if (digested.runs > 0) {

    await markGlobalReadingDirty(userId, "digest_without_reading_refresh");

  }



  if (metrics.aiCallsCompleted > 0) {

    await recordReadingDelivery(userId);

  }



  return {

    ok: true,

    mapVersion,

    skipped: false,

    digested,

    insights: { refreshed: insightsRefreshed, skipped: !insightsRefreshed },

    story: { refreshed: storyRefreshed, skipped: !storyRefreshed },

    progress: {

      startedWork: metrics.startedWork,

      morePending: metrics.morePending,

      retryableAt: null,

      deliveryBlocked: false,

      pendingInsightCount: metrics.pendingInsightCount,

    },

    metrics,

  };

}

/** Serialize ai-sync per user so debounced + manual taps never run Gemini in parallel. */
export async function runMapAiSync(
  userId: string,
  options?: { force?: boolean },
): Promise<MapAiSyncResult> {
  const key = userId.trim();
  const previous = syncChains.get(key) ?? Promise.resolve();
  const run = previous.then(
    () => runMapAiSyncInner(userId, options),
    () => runMapAiSyncInner(userId, options),
  );
  syncChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}


