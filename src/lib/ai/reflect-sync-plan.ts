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

async function listDirtyThemeIds(userId: string): Promise<string[]> {
  const mapContext = await formatMapContext(userId);
  return mapContext.themes
    .filter((theme) => theme.hubs.some((hub) => hub.pursuits.length > 0))
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
    storyStale: boolean;
    insightsStale: boolean;
    hasStory: boolean;
  },
): Promise<ReflectWorkPlan> {
  if (dirty.activeDirtyPursuitIds.length > 0) {
    const themeIds =
      dirty.themeIds.length > 0 ? dirty.themeIds : options.storyStale ? await listDirtyThemeIds(userId) : [];
    return {
      mode: "dirty",
      pursuitIds: dirty.activeDirtyPursuitIds,
      themeIds,
    };
  }

  if (options.storyStale || options.insightsStale) {
    return {
      mode: "full",
      pursuitIds: await listEligiblePursuitIds(userId),
      themeIds: await listDirtyThemeIds(userId),
    };
  }

  const missingPanelIds = await listMissingPursuitPanelIds(userId);

  if (!options.hasStory && (options.force || missingPanelIds.length > 0)) {
    return {
      mode: "full",
      pursuitIds: await listEligiblePursuitIds(userId),
      themeIds: await listDirtyThemeIds(userId),
    };
  }

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
    storyStale: boolean;
    insightsStale: boolean;
    hasStory: boolean;
  },
): Promise<boolean> {
  const plan = await planReflectWork(userId, dirty, options);
  return plan.mode === "skip";
}
