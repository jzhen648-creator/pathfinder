import type { InsightCache } from "@prisma/client";

import {
  globalNowInsightSchema,
  insightLevelSchema,
  pursuitInsightSchema,
  type GlobalNowInsight,
  type InsightCachePayload,
  type InsightLevelPayload,
  type PursuitInsightPayload,
} from "./insight-types";

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
): Record<string, PursuitInsightPayload> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PursuitInsightPayload> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = pursuitInsightSchema.safeParse(value);
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
  const global = parseGlobalInsight(row.globalInsight);
  if (!global) return null;

  return {
    global,
    themes: parseInsightLevelRecord(row.themeInsights, "theme"),
    hubs: parseInsightLevelRecord(row.hubInsights, "hub"),
    pursuits: parsePursuitInsightRecord(row.pursuitInsights, "pursuit"),
    generatedAt: row.generatedAt.toISOString(),
    mapVersion: row.mapVersion,
    memoryVersion: row.memoryVersion,
    stale,
  };
}

export type { InsightCache };
