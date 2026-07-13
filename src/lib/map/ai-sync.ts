import { AiUserRateLimitError } from "@/lib/ai/ai-user-rate-limit";

import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";

import { composeInsightCacheMapVersion } from "@/lib/insights/reflect-prompt-version";
import {
  isPromptOnlyReadingDrift,
  isReadingDrift,
} from "@/lib/insights/reading-cache-stale";

import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";

import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

import { emptyMapAiSyncMetrics, type MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

import { isReflectCallEnabled, runReflectSync } from "@/lib/ai/generate-reflect";
import { reflectSyncWouldSkip } from "@/lib/ai/reflect-sync-plan";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import {
  checkReadingDeliveryGate,
  recordReadingDelivery,
} from "@/lib/map/reading-delivery-cadence";
import {
  isPeriodicFullRefreshDue,
  recordFullReflectDelivery,
} from "@/lib/map/reading-periodic-full-refresh";
import {
  clearReadingDirtyLedger,
  analyzeReadingDirty,
  listReadingDirtySummary,
} from "@/lib/map/reading-dirty-ledger";

import { prisma } from "@/lib/prisma";

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
  insights: { refreshed: boolean; skipped: boolean };
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

function buildBaseResult(mapVersion: string, metrics: MapAiSyncMetrics): MapAiSyncResult {
  return {
    ok: true,
    mapVersion,
    skipped: true,
    insights: { refreshed: false, skipped: true },
    progress: {
      startedWork: metrics.startedWork,
      morePending: metrics.morePending,
      retryableAt: metrics.rateLimited
        ? new Date(Date.now() + 120_000).toISOString()
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
  options?: { force?: boolean; enrichOptions?: PursuitEnrichOptions },
): Promise<MapAiSyncResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  let force = options?.force === true;
  const enrichOptions = resolvePursuitEnrichOptions(options?.enrichOptions);
  const metrics = emptyMapAiSyncMetrics();
  const { mapVersion, memoryVersion } = await resolveVersions(userId);

  const [insightRow, dirtySummary] = await Promise.all([
    prisma.insightCache.findUnique({ where: { userId } }),
    listReadingDirtySummary(userId),
  ]);

  const insightsStale =
    !insightRow || isReadingDrift(insightRow, mapVersion, memoryVersion);

  const promptOnlyStale =
    insightRow != null &&
    isPromptOnlyReadingDrift(insightRow, mapVersion, memoryVersion);

  const reflectEnabled = isReflectCallEnabled();

  metrics.dirtyItems = dirtySummary.totalItems;
  metrics.dirtyPursuits = dirtySummary.pursuitIds.length;

  let periodicFull = false;
  if (!force && dirtySummary.totalItems === 0 && insightRow) {
    periodicFull = await isPeriodicFullRefreshDue(userId);
    if (periodicFull) force = true;
  }
  metrics.periodicFull = periodicFull;

  let insightWorkNeeded = insightsStale || dirtySummary.totalItems > 0 || periodicFull;

  if (reflectEnabled) {
    if (!insightWorkNeeded && force) {
      const dirty = await analyzeReadingDirty(userId);
      insightWorkNeeded = !(await reflectSyncWouldSkip(userId, dirty, {
        force: true,
        insightsStale,
        hasInsightCache: Boolean(insightRow),
      }));
    }
  } else if (force) {
    insightWorkNeeded = true;
  }

  if (!insightWorkNeeded) {
    return buildBaseResult(mapVersion, metrics);
  }

  const deliveryGate = await checkReadingDeliveryGate(userId, {
    force: force || promptOnlyStale,
    hasInsightCache: Boolean(insightRow),
  });

  if (!deliveryGate.allowed && insightWorkNeeded) {
    metrics.deliveryBlocked = true;
    metrics.deliveryRetryAfterMs = deliveryGate.retryAfterMs;
    metrics.morePending = dirtySummary.totalItems > 0 || dirtySummary.pursuitIds.length > 0;
    metrics.pendingInsightCount = dirtySummary.pursuitIds.length;
    return buildBaseResult(mapVersion, metrics);
  }

  if (!reflectEnabled) {
    console.warn("[map/ai-sync] USE_REFLECT_CALL is not enabled — sync skipped");
    return buildBaseResult(mapVersion, metrics);
  }

  metrics.startedWork = true;

  let insightsRefreshed = false;

  try {
    const reflect = await runReflectSync(userId, mapVersion, memoryVersion, {
      force,
      insightsStale,
      metrics,
      enrichOptions,
    });

    if (reflect.skipped) {
      metrics.startedWork = false;
      return buildBaseResult(mapVersion, metrics);
    }

    insightsRefreshed = reflect.insightsRefreshed;

    if (reflect.geminiRateLimited) {
      metrics.rateLimited = true;
    }
  } catch (err) {
    if (err instanceof AiUserRateLimitError) {
      metrics.rateLimited = true;
      const partial = buildBaseResult(mapVersion, metrics);
      partial.skipped = false;
      throw new MapAiSyncRateLimitError(err.retryAfterMs, partial);
    }

    throw err;
  }

  if (!insightsRefreshed && metrics.rateLimited) {
    const partial = buildBaseResult(mapVersion, metrics);
    partial.skipped = false;
    throw new MapAiSyncRateLimitError(120_000, partial);
  }

  if (insightsRefreshed) {
    const row = await prisma.insightCache.findUnique({ where: { userId } });
    if (!row || !insightCacheToPayload(row, false)) {
      throw new Error("Failed to store insights after sync");
    }
  }

  if (insightsRefreshed && !metrics.morePending) {
    const fresh = await resolveVersions(userId);
    await prisma.insightCache.update({
      where: { userId },
      data: {
        mapVersion: composeInsightCacheMapVersion(fresh.mapVersion),
        memoryVersion: fresh.memoryVersion,
      },
    });

    await clearReadingDirtyLedger(userId);
  }

  if (metrics.aiCallsCompleted > 0) {
    await recordReadingDelivery(userId);
  }

  if (insightsRefreshed && metrics.fullRefresh) {
    await recordFullReflectDelivery(userId);
  }

  return {
    ok: true,
    mapVersion,
    skipped: false,
    insights: { refreshed: insightsRefreshed, skipped: !insightsRefreshed },
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
  options?: { force?: boolean; enrichOptions?: PursuitEnrichOptions },
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
