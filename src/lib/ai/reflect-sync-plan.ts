import { formatMapContext } from "@/lib/ai/format-map-context";
import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  parseInsightLevelRecord,
  parsePursuitInsightRecord,
} from "@/lib/insights/parse-insight-cache";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import { hasSubstantivePursuitHeadline } from "@/lib/pursuit/pursuit-enrich-types";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import {
  isEditOnlyDirtyBatch,
  needsFullReflectRegen,
  shouldUseFullReadingRefresh,
} from "@/lib/map/reading-dirty-ledger";
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

/** Pursuit panels with no substantive cached headline — eligible for panel-only repair. */
export async function listMissingPursuitPanelIds(userId: string): Promise<string[]> {
  const eligibleIds = await listEligiblePursuitIds(userId);
  if (eligibleIds.length === 0) return [];

  const insightRow = await prisma.insightCache.findUnique({ where: { userId } });
  if (!insightRow) return eligibleIds;

  const cached = parsePursuitInsightRecord(insightRow.pursuitInsights, "pursuit");
  return eligibleIds.filter((id) => !hasSubstantivePursuitHeadline(cached[id]?.headline));
}

export async function listDirtyThemeIds(userId: string): Promise<string[]> {
  const mapContext = await formatMapContext(userId);
  return mapContext.themes
    .filter((theme) => theme.categories.some((category) => category.pursuits.length > 0))
    .map((theme) => theme.id);
}

/** Themes touched by dirty pursuits — used when the ledger has pursuit rows but no theme rows. */
export async function themeIdsForPursuits(
  userId: string,
  pursuitIds: string[],
): Promise<string[]> {
  const ids = [...new Set(pursuitIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: ids }, archived: false },
    select: { themeId: true },
  });
  return [...new Set(goals.map((goal) => goal.themeId ?? "becoming"))];
}

/** True when a theme insight row has at least one populated beat. */
export function hasThemeInsightContent(insight: InsightLevelPayload): boolean {
  return Boolean(
    insight.oneLiner?.trim() ||
      insight.reflective?.trim() ||
      insight.combined?.trim() ||
      insight.contextual?.trim(),
  );
}

async function loadCachedThemeInsights(
  userId: string,
): Promise<Record<string, InsightLevelPayload>> {
  const insightRow = await prisma.insightCache.findUnique({ where: { userId } });
  if (!insightRow) return {};
  return parseInsightLevelRecord(insightRow.themeInsights, "theme");
}

/** Themes in candidates that have chapters but no cached theme reading yet. */
export function themeIdsMissingInsight(
  cachedThemes: Record<string, InsightLevelPayload>,
  candidateThemeIds: string[],
): string[] {
  const unique = [...new Set(candidateThemeIds.filter(Boolean))];
  return unique.filter((themeId) => {
    const insight = cachedThemes[themeId];
    return !insight || !hasThemeInsightContent(insight);
  });
}

async function filterThemesMissingCachedInsight(
  userId: string,
  candidateThemeIds: string[],
): Promise<string[]> {
  const cached = await loadCachedThemeInsights(userId);
  return themeIdsMissingInsight(cached, candidateThemeIds);
}

/** Active themes with pursuits but no synthesized theme insight in cache. */
export async function listMissingThemeInsightIds(userId: string): Promise<string[]> {
  const themesWithChapters = await listDirtyThemeIds(userId);
  if (themesWithChapters.length === 0) return [];
  return filterThemesMissingCachedInsight(userId, themesWithChapters);
}

async function listEligiblePursuitIdsForThemes(
  userId: string,
  themeIds: string[],
): Promise<string[]> {
  const ids = [...new Set(themeIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const goals = await prisma.goal.findMany({
    where: {
      userId,
      themeId: { in: ids },
      ...interpretationEligiblePursuitWhere,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return goals.map((goal) => goal.id);
}

async function buildFullReflectPlan(userId: string): Promise<ReflectWorkPlan> {
  return {
    mode: "full",
    pursuitIds: await listEligiblePursuitIds(userId),
    themeIds: await listDirtyThemeIds(userId),
  };
}

/**
 * Decide which pursuits/themes need reflect work.
 * Manual force refresh regenerates theme readings + all pursuit panels.
 * Incremental dirty sync runs even when mapVersion drift marks insights stale.
 */
export async function planReflectWork(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  options: {
    force?: boolean;
    insightsStale: boolean;
    hasInsightCache?: boolean;
  },
): Promise<ReflectWorkPlan> {
  if (options.force === true || needsFullReflectRegen(dirty)) {
    return buildFullReflectPlan(userId);
  }

  if (dirty.activeDirtyPursuitIds.length > 0) {
    if (await shouldUseFullReadingRefresh(userId, dirty.activeDirtyPursuitIds.length)) {
      return buildFullReflectPlan(userId);
    }

    const editOnly = await isEditOnlyDirtyBatch(userId);
    const touchedThemeIds =
      dirty.themeIds.length > 0
        ? dirty.themeIds
        : await themeIdsForPursuits(userId, dirty.activeDirtyPursuitIds);
    const themeIds = editOnly
      ? await filterThemesMissingCachedInsight(userId, touchedThemeIds)
      : touchedThemeIds;

    return {
      mode: "dirty",
      pursuitIds: dirty.activeDirtyPursuitIds,
      themeIds,
    };
  }

  if (!options.hasInsightCache || options.insightsStale) {
    return buildFullReflectPlan(userId);
  }

  const missingPanelIds = await listMissingPursuitPanelIds(userId);

  if (missingPanelIds.length > 0) {
    return {
      mode: "panels-only",
      pursuitIds: missingPanelIds,
      themeIds: [],
    };
  }

  const missingThemeIds = await listMissingThemeInsightIds(userId);
  if (missingThemeIds.length > 0) {
    const pursuitIds = await listEligiblePursuitIdsForThemes(userId, missingThemeIds);
    if (pursuitIds.length > 0) {
      return {
        mode: "dirty",
        pursuitIds,
        themeIds: missingThemeIds,
      };
    }
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
    hasInsightCache?: boolean;
  },
): Promise<boolean> {
  const plan = await planReflectWork(userId, dirty, options);
  return plan.mode === "skip";
}
