import { formatMapContext } from "@/lib/ai/format-map-context";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";

export type ReflectWorkMode = "skip" | "dirty" | "full" | "panels-only";

export type ReflectWorkPlan = {
  mode: ReflectWorkMode;
  pursuitIds: string[];
  themeIds: string[];
};

export async function listEligiblePursuitIds(userId: string): Promise<string[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, ...interpretationEligiblePursuitWhere },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return goals.map((goal) => goal.id);
}

/** Pursuit panels with no cached headline — eligible for panel-only repair. */
export async function listMissingPursuitPanelIds(userId: string): Promise<string[]> {
  const eligibleIds = await listEligiblePursuitIds(userId);
  if (eligibleIds.length === 0) return [];

  const insightRow = await prisma.insightCache.findUnique({ where: { userId } });
  if (!insightRow) return eligibleIds;

  const cached = parsePursuitInsightRecord(insightRow.pursuitInsights, "pursuit");
  return eligibleIds.filter((id) => !cached[id]?.headline?.trim());
}

export async function listDirtyThemeIds(userId: string): Promise<string[]> {
  const mapContext = await formatMapContext(userId);
  return mapContext.themes
    .filter((theme) => theme.categories.some((category) => category.pursuits.length > 0))
    .map((theme) => theme.id);
}

/**
 * Decide which pursuits/themes need reflect work.
 * force alone does not trigger a full refresh — only missing panels or stale caches.
 */
export async function planReflectWork(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  options: {
    force?: boolean;
    insightsStale: boolean;
  },
): Promise<ReflectWorkPlan> {
  if (dirty.activeDirtyPursuitIds.length > 0) {
    return {
      mode: "dirty",
      pursuitIds: dirty.activeDirtyPursuitIds,
      themeIds: dirty.themeIds,
    };
  }

  if (options.insightsStale) {
    return {
      mode: "full",
      pursuitIds: await listEligiblePursuitIds(userId),
      themeIds: await listDirtyThemeIds(userId),
    };
  }

  const missingPanelIds = await listMissingPursuitPanelIds(userId);

  if (options.force && missingPanelIds.length > 0) {
    return {
      mode: "panels-only",
      pursuitIds: missingPanelIds,
      themeIds: [],
    };
  }

  return { mode: "skip", pursuitIds: [], themeIds: [] };
}

/** True when manual sync has nothing to regenerate. */
export async function reflectSyncWouldSkip(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  options: {
    force?: boolean;
    insightsStale: boolean;
  },
): Promise<boolean> {
  const plan = await planReflectWork(userId, dirty, options);
  return plan.mode === "skip";
}
