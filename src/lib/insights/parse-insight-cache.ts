import type { InsightCache } from "@prisma/client";

import {
  globalNowInsightSchema,
  insightLevelSchema,
  overallInsightSchema,
  type GlobalNowInsight,
  type InsightCachePayload,
  type InsightLevelPayload,
  type OverallInsightPayload,
} from "./insight-types";
import {
  pursuitEnrichCacheSchema,
  type PursuitEnrichCachePayload,
} from "@/lib/pursuit/pursuit-enrich-types";

type InsightCacheRow = InsightCache & {
  categoryInsights?: unknown;
  /** Pre-migration column — dual-read until all DBs renamed. */
  hubInsights?: unknown;
};

export function readCategoryInsightsRaw(row: InsightCacheRow): unknown {
  return row.categoryInsights ?? row.hubInsights;
}

export function parseInsightLevelRecord(
  raw: unknown,
  label: string,
): Record<string, InsightLevelPayload> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, InsightLevelPayload> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = insightLevelSchema.safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  if (Object.keys(out).length === 0 && raw !== null) {
    console.warn(`[insights] ${label} cache had no valid entries`);
  }
  return out;
}

export function parsePursuitInsightRecord(
  raw: unknown,
  label: string,
): Record<string, PursuitEnrichCachePayload> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PursuitEnrichCachePayload> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = pursuitEnrichCacheSchema.safeParse(value);
    if (parsed.success) {
      out[key] = parsed.data;
      continue;
    }
    // Drop legacy four-field entries — mobile will regenerate with the new schema.
  }
  if (Object.keys(out).length === 0 && raw !== null) {
    console.warn(`[insights] ${label} cache had no valid entries`);
  }
  return out;
}

export function parseOverallInsight(raw: unknown): OverallInsightPayload | null {
  const parsed = overallInsightSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseGlobalInsight(raw: string): GlobalNowInsight | null {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = globalNowInsightSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function insightCacheToPayload(
  row: InsightCache,
  stale: boolean,
): InsightCachePayload | null {
  const cacheRow = row as InsightCacheRow;
  const themes = parseInsightLevelRecord(row.themeInsights, "theme");
  const categories = parseInsightLevelRecord(readCategoryInsightsRaw(cacheRow), "category");
  const pursuits = parsePursuitInsightRecord(row.pursuitInsights, "pursuit");
  const overall = parseOverallInsight(row.overallInsight);

  let global = parseGlobalInsight(row.globalInsight);
  const hasNodeContent =
    Object.keys(themes).length > 0 ||
    Object.keys(categories).length > 0 ||
    Object.keys(pursuits).length > 0;

  if (!global) {
    if (!hasNodeContent) return null;
    // Reflect sync stores placeholder global — still serve theme/pursuit panels.
    global = { greeting: "", sections: [] };
  }

  return {
    global,
    ...(overall ? { overall } : {}),
    themes,
    categories,
    pursuits,
    generatedAt: row.generatedAt.toISOString(),
    mapVersion: row.mapVersion,
    memoryVersion: row.memoryVersion,
    stale,
  };
}

export type { InsightCache };
