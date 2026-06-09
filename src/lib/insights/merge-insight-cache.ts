import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights, generateNodeInsights } from "@/lib/insights/generate-insights";
import { parseInsightLevelRecord } from "@/lib/insights/parse-insight-cache";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { prisma } from "@/lib/prisma";

function mergeLevelRecords(
  base: Record<string, InsightGenerationResult["pursuits"][string]>,
  patch: Record<string, InsightGenerationResult["pursuits"][string]>,
) {
  return { ...base, ...patch };
}

/** Merge node-level insight patches into the user's cache without wiping unrelated entries. */
export async function mergeNodeInsightsIntoCache(
  userId: string,
  patch: Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits">,
): Promise<void> {
  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
  ]);

  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) {
    const generated = await generateInsights(userId);
    await prisma.insightCache.create({
      data: {
        userId,
        globalInsight: JSON.stringify(generated.global),
        themeInsights: generated.themes,
        hubInsights: generated.hubs,
        pursuitInsights: generated.pursuits,
        mapVersion,
        memoryVersion,
      },
    });
    return;
  }

  const themes = mergeLevelRecords(
    parseInsightLevelRecord(existing.themeInsights, "theme"),
    patch.themes,
  );
  const hubs = mergeLevelRecords(
    parseInsightLevelRecord(existing.hubInsights, "hub"),
    patch.hubs,
  );
  const pursuits = mergeLevelRecords(
    parseInsightLevelRecord(existing.pursuitInsights, "pursuit"),
    patch.pursuits,
  );

  await prisma.insightCache.update({
    where: { userId },
    data: {
      themeInsights: themes,
      hubInsights: hubs,
      pursuitInsights: pursuits,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
}

/** Generate and merge insights for specific pursuits (and their hub/theme context). */
export async function refreshPursuitInsights(userId: string, pursuitIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(pursuitIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const generated = await generateNodeInsights(userId, { pursuitIds: uniqueIds });
  await mergeNodeInsightsIntoCache(userId, generated);
}

export function isInsightEligibleGoalType(goalType: string): boolean {
  return goalType !== "moment" && goalType !== "event";
}
