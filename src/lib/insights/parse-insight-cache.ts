import type { InsightCache } from "@prisma/client";

import {
  globalNowInsightSchema,
  insightLevelSchema,
  type GlobalNowInsight,
  type InsightCachePayload,
  type InsightLevelPayload,
} from "./insight-types";
import {
  pursuitEnrichCacheSchema,
  type PursuitEnrichCachePayload,
} from "@/lib/pursuit/pursuit-enrich-types";

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
  const themes = parseInsightLevelRecord(row.themeInsights, "theme");
  const hubs = parseInsightLevelRecord(row.hubInsights, "hub");
  const pursuits = parsePursuitInsightRecord(row.pursuitInsights, "pursuit");

  let global = parseGlobalInsight(row.globalInsight);
  const hasNodeContent =
    Object.keys(themes).length > 0 ||
    Object.keys(hubs).length > 0 ||
    Object.keys(pursuits).length > 0;

  if (!global) {
    if (!hasNodeContent) return null;
    // Reflect sync stores placeholder global — still serve theme/pursuit panels.
    global = { greeting: "", sections: [] };
  }

  return {
    global,
    themes,
    hubs,
    pursuits,
    generatedAt: row.generatedAt.toISOString(),
    mapVersion: row.mapVersion,
    memoryVersion: row.memoryVersion,
    stale,
  };
}

export type { InsightCache };
