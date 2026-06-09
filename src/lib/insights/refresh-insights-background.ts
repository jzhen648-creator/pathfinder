import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights } from "@/lib/insights/generate-insights";
import { refreshPursuitInsights } from "@/lib/insights/merge-insight-cache";
import { hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

const REFRESH_DEBOUNCE_MS = 3_000;

export type InsightRefreshScope = {
  pursuitIds?: string[];
};

type PendingRefresh = {
  mode: "full" | "incremental";
  pursuitIds: Set<string>;
};

const pendingRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingRefreshByUser = new Map<string, PendingRefresh>();
const refreshInFlight = new Set<string>();

async function runFullInsightRefresh(userId: string): Promise<void> {
  const [mapVersion, memoryVersion, generated] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
    generateInsights(userId),
  ]);
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

async function runInsightRefresh(userId: string): Promise<void> {
  if (refreshInFlight.has(userId)) {
    scheduleInsightRefresh(userId);
    return;
  }
  refreshInFlight.add(userId);

  const pending = pendingRefreshByUser.get(userId);
  pendingRefreshByUser.delete(userId);

  try {
    if (pending?.mode === "full") {
      await runFullInsightRefresh(userId);
      return;
    }

    const pursuitIds = pending?.pursuitIds ? [...pending.pursuitIds] : [];
    if (pursuitIds.length > 0) {
      await refreshPursuitInsights(userId, pursuitIds);
      return;
    }

    await runFullInsightRefresh(userId);
  } catch (err) {
    console.error("[refreshInsightsInBackground]", err);
  } finally {
    refreshInFlight.delete(userId);
  }
}

function scheduleInsightRefresh(userId: string): void {
  const existing = pendingRefreshTimers.get(userId);
  if (existing) clearTimeout(existing);
  pendingRefreshTimers.set(
    userId,
    setTimeout(() => {
      pendingRefreshTimers.delete(userId);
      void runInsightRefresh(userId);
    }, REFRESH_DEBOUNCE_MS),
  );
}

function queueRefresh(userId: string, scope?: InsightRefreshScope): void {
  const pursuitIds = scope?.pursuitIds?.filter(Boolean) ?? [];
  const current = pendingRefreshByUser.get(userId);

  if (pursuitIds.length > 0) {
    const next: PendingRefresh =
      current?.mode === "full"
        ? current
        : {
            mode: "incremental",
            pursuitIds: new Set([...(current?.pursuitIds ?? []), ...pursuitIds]),
          };
    pendingRefreshByUser.set(userId, next);
  } else {
    pendingRefreshByUser.set(userId, { mode: "full", pursuitIds: new Set() });
  }

  scheduleInsightRefresh(userId);
}

/** Fire-and-forget insight regen after map changes; debounced per user. */
export function refreshInsightsInBackground(userId: string, scope?: InsightRefreshScope): void {
  if (!hasGeminiKey()) return;
  queueRefresh(userId, scope);
}

/** Incremental pursuit insight refresh — merges into existing cache. */
export function refreshPursuitInsightsInBackground(userId: string, pursuitIds: string[]): void {
  refreshInsightsInBackground(userId, { pursuitIds });
}
