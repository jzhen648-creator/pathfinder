import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import {
  parseInsightLevelRecord,
  parsePursuitInsightRecord,
  readCategoryInsightsRaw,
} from "@/lib/insights/parse-insight-cache";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { gateThemeInsightsPatch } from "@/lib/insights/gate-theme-insights";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import { prisma } from "@/lib/prisma";

export { pruneOffMapPursuitsFromInsightCache, pruneArchivedPursuitsFromInsightCache } from "@/lib/insights/invalidate-reading-caches";
export { gateThemeInsightsPatch } from "@/lib/insights/gate-theme-insights";

function mergeLevelRecords<T extends Record<string, unknown>>(base: Record<string, T>, patch: Record<string, T>) {
  return { ...base, ...patch };
}

function emptyGlobalInsightJson(): string {
  return JSON.stringify({ greeting: "", sections: [] });
}

/** True when a reflect/enrich patch carries node-level insight rows to persist. */
export function patchHasNodeInsightContent(
  patch: Pick<InsightGenerationResult, "themes" | "categories" | "pursuits">,
): boolean {
  return (
    Object.keys(patch.themes).length > 0 ||
    Object.keys(patch.categories).length > 0 ||
    Object.keys(patch.pursuits).length > 0
  );
}

/** Merge node-level insight patches into the user's cache without wiping unrelated entries. */
export async function mergeNodeInsightsIntoCache(
  userId: string,
  patch: Pick<InsightGenerationResult, "themes" | "categories" | "pursuits">,
  options?: { stampMapVersion?: boolean },
): Promise<void> {
  const gatedThemes =
    Object.keys(patch.themes).length > 0
      ? await gateThemeInsightsPatch(userId, patch.themes)
      : patch.themes;
  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
  ]);

  const stampMapVersion = options?.stampMapVersion !== false;

  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) {
    if (!patchHasNodeInsightContent(patch)) return;

    await prisma.insightCache.create({
      data: {
        userId,
        globalInsight: emptyGlobalInsightJson(),
        themeInsights: gatedThemes,
        categoryInsights: patch.categories,
        pursuitInsights: patch.pursuits,
        mapVersion,
        memoryVersion,
      },
    });
    return;
  }

  const themes = mergeLevelRecords(
    parseInsightLevelRecord(existing.themeInsights, "theme"),
    gatedThemes,
  );
  const categories = mergeLevelRecords(
    parseInsightLevelRecord(readCategoryInsightsRaw(existing), "category"),
    patch.categories,
  );
  const pursuits = mergeLevelRecords(
    parsePursuitInsightRecord(existing.pursuitInsights, "pursuit"),
    patch.pursuits,
  );

  const pursuitOnlyPatch =
    Object.keys(patch.themes).length === 0 &&
    Object.keys(patch.categories).length === 0 &&
    Object.keys(patch.pursuits).length > 0;

  let nextMapVersion = existing.mapVersion;
  let nextMemoryVersion = existing.memoryVersion;
  if (stampMapVersion && !pursuitOnlyPatch) {
    nextMapVersion = mapVersion;
    nextMemoryVersion = memoryVersion;
  } else if (stampMapVersion && pursuitOnlyPatch) {
    const eligibleGoals = await prisma.goal.findMany({
      where: {
        userId,
        ...interpretationEligiblePursuitWhere,
      },
      select: { id: true },
    });
    const allPursuitsCached = eligibleGoals.every(
      (goal) => Boolean(pursuits[goal.id]?.headline?.trim()),
    );
    if (allPursuitsCached) {
      nextMapVersion = mapVersion;
      nextMemoryVersion = memoryVersion;
    }
  }

  await prisma.insightCache.update({
    where: { userId },
    data: {
      themeInsights: themes,
      categoryInsights: categories,
      pursuitInsights: pursuits,
      generatedAt: new Date(),
      mapVersion: nextMapVersion,
      memoryVersion: nextMemoryVersion,
    },
  });
}

export function isInsightEligibleGoalType(goalType: string): boolean {
  return goalType !== "moment" && goalType !== "event";
}
