import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights } from "@/lib/insights/generate-insights";
import { hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

const REFRESH_DEBOUNCE_MS = 3_000;

const pendingRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const refreshInFlight = new Set<string>();

async function runInsightRefresh(userId: string): Promise<void> {
  if (refreshInFlight.has(userId)) {
    scheduleInsightRefresh(userId);
    return;
  }
  refreshInFlight.add(userId);
  try {
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

/** Fire-and-forget insight regen after map changes; debounced per user. */
export function refreshInsightsInBackground(userId: string): void {
  if (!hasGeminiKey()) return;
  scheduleInsightRefresh(userId);
}
