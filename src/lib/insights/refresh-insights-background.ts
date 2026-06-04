import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights } from "@/lib/insights/generate-insights";
import { hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

/** Fire-and-forget insight regen after map changes (e.g. pursuit Stream). */
export function refreshInsightsInBackground(userId: string): void {
  if (!hasGeminiKey()) return;
  void (async () => {
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
    }
  })();
}
