import type { InsightCache } from "@prisma/client";

import {

  globalNowInsightSchema,

  insightLevelSchema,

  type GlobalNowInsight,

  type InsightCachePayload,

  type InsightLevelPayload,

} from "./insight-types";



function parseRecord(

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

    themes: parseRecord(row.themeInsights, "theme"),

    hubs: parseRecord(row.hubInsights, "hub"),

    pursuits: parseRecord(row.pursuitInsights, "pursuit"),

    generatedAt: row.generatedAt.toISOString(),

    mapVersion: row.mapVersion,

    memoryVersion: row.memoryVersion,

    stale,

  };

}



export type { InsightCache };


