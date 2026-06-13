import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights, generateNodeInsights } from "@/lib/insights/generate-insights";
import {
  parseInsightLevelRecord,
  parsePursuitInsightRecord,
} from "@/lib/insights/parse-insight-cache";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { prisma } from "@/lib/prisma";

function mergeLevelRecords<T extends Record<string, unknown>>(base: Record<string, T>, patch: Record<string, T>) {
  return { ...base, ...patch };
}

/** Merge node-level insight patches into the user's cache without wiping unrelated entries. */
export async function mergeNodeInsightsIntoCache(
  userId: string,
  patch: Pick<InsightGenerationResult, "themes" | "hubs" | "pursuits">,
  options?: { stampMapVersion?: boolean },
): Promise<void> {
  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
  ]);

  const stampMapVersion = options?.stampMapVersion !== false;

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
    parsePursuitInsightRecord(existing.pursuitInsights, "pursuit"),
    patch.pursuits,
  );

  const pursuitOnlyPatch =
    Object.keys(patch.themes).length === 0 &&
    Object.keys(patch.hubs).length === 0 &&
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
        archived: false,
        goalType: { notIn: ["moment", "event"] },
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
      hubInsights: hubs,
      pursuitInsights: pursuits,
      generatedAt: new Date(),
      mapVersion: nextMapVersion,
      memoryVersion: nextMemoryVersion,
    },
  });
}

/** Generate and merge insights for specific pursuits (and their hub/theme context). */
export async function refreshPursuitInsights(userId: string, pursuitIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(pursuitIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const generated = await generateNodeInsights(userId, { pursuitIds: uniqueIds });
  await mergeNodeInsightsIntoCache(userId, generated, { stampMapVersion: true });
}

export function isInsightEligibleGoalType(goalType: string): boolean {
  return goalType !== "moment" && goalType !== "event";
}

/** Drop per-pursuit insight cache entries for archived or deleted goals. */
export async function pruneArchivedPursuitsFromInsightCache(userId: string): Promise<boolean> {
  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) return false;

  const activeGoals = await prisma.goal.findMany({
    where: {
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: { id: true },
  });
  const activeIds = new Set(activeGoals.map((goal) => goal.id));

  const pursuits = parsePursuitInsightRecord(existing.pursuitInsights, "pursuit");
  const prunedEntries = Object.entries(pursuits).filter(([id]) => activeIds.has(id));
  if (prunedEntries.length === Object.keys(pursuits).length) return false;

  const pruned = Object.fromEntries(prunedEntries);
  await prisma.insightCache.update({
    where: { userId },
    data: {
      pursuitInsights: pruned,
      generatedAt: new Date(),
    },
  });
  return true;
}
