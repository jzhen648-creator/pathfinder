import type { InsightCachePayload } from "@/lib/insights/insight-types";
import { gateThemeInsightsPatch } from "@/lib/insights/gate-theme-insights";

/** Apply live theme beat gates before serving insight cache to mobile. */
export async function applyThemeInsightGatesToPayload(
  userId: string,
  payload: InsightCachePayload,
): Promise<InsightCachePayload> {
  if (Object.keys(payload.themes).length === 0) return payload;
  const gatedThemes = await gateThemeInsightsPatch(userId, payload.themes);
  return { ...payload, themes: gatedThemes };
}
