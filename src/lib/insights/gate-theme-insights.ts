import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  gateThemeCombined,
  gateThemeContextual,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitSignalsByTheme } from "@/lib/pursuit/load-pursuit-signals";

/** Strip theme contextual/combined benchmarks when no pursuit in the theme has enough user context. */
export async function gateThemeInsightsPatch(
  userId: string,
  themes: Record<string, InsightLevelPayload>,
): Promise<Record<string, InsightLevelPayload>> {
  const themeIds = Object.keys(themes);
  if (themeIds.length === 0) return themes;

  const signalsByTheme = await loadPursuitSignalsByTheme(userId, themeIds);

  const gated: Record<string, InsightLevelPayload> = {};
  for (const [themeId, entry] of Object.entries(themes)) {
    const themeSignals = signalsByTheme.get(themeId) ?? [];
    gated[themeId] = {
      ...entry,
      contextual: gateThemeContextual(entry.contextual?.trim() ?? "", themeSignals),
      combined: gateThemeCombined(entry.combined?.trim() ?? "", themeSignals),
    };
  }
  return gated;
}
