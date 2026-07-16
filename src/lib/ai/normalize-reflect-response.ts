import { truncateAtWordBoundary } from "@/lib/insights/clamp-insight-json";
import { claimsRoughlyEqual, clarifyInsightHeadline } from "@/lib/insights/insight-clarity";
import { PURSUIT_INSIGHT_COMPARISON_MAX } from "@/lib/insights/insight-field-limits";
import { normalizePursuitEnrichEntry } from "@/lib/pursuit/normalize-pursuit-enrich";

export { truncateAtWordBoundary } from "@/lib/insights/clamp-insight-json";

const THEME_TONES = ["encouraging", "nudge", "celebratory"] as const;

export const THEME_ONE_LINER_MAX = 140;
export const OVERALL_SUPPORT_MAX = 480;
const THEME_REFLECTIVE_MAX = 800;
const THEME_SUPPLEMENT_MAX = 500;

function oneLinersRoughlyEqual(a: string, b: string): boolean {
  return claimsRoughlyEqual(a, b);
}

/** Trim theme oneLiner to max length on a word boundary; append … when shortened. */
export function truncateThemeOneLiner(text: string, max = THEME_ONE_LINER_MAX): string {
  return truncateAtWordBoundary(text, max);
}

/** Coerce Gemini theme tone drift before Zod — pursuit-only tones map to default. */
export function normalizeThemeTone(raw: unknown): (typeof THEME_TONES)[number] {
  if (typeof raw === "string" && (THEME_TONES as readonly string[]).includes(raw)) {
    return raw as (typeof THEME_TONES)[number];
  }
  return "encouraging";
}

/**
 * Prefer theme synthesis when a chapter headline restates the same claim.
 * Leaves an empty headline so apply/display can fall back to deterministic facts.
 */
export function dedupePursuitHeadlinesAgainstThemes(
  pursuits: Record<string, Record<string, unknown>>,
  themeOneLiners: string[],
): Record<string, Record<string, unknown>> {
  if (themeOneLiners.length === 0) return pursuits;
  const next: Record<string, Record<string, unknown>> = {};
  for (const [pursuitId, entry] of Object.entries(pursuits)) {
    const headline = typeof entry.headline === "string" ? entry.headline.trim() : "";
    const echoesTheme =
      headline.length > 0 &&
      themeOneLiners.some((themeOneLiner) => oneLinersRoughlyEqual(headline, themeOneLiner));
    next[pursuitId] = echoesTheme
      ? {
          ...entry,
          headline: "",
        }
      : entry;
  }
  return next;
}

/** Coerce Gemini reflect JSON before Zod — reuse pursuit enrich normalizer for panel entries. */
export function normalizeReflectResponse(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  const pursuits = root.pursuits;
  let normalizedPursuits: Record<string, Record<string, unknown>> = {};
  if (pursuits && typeof pursuits === "object" && !Array.isArray(pursuits)) {
    for (const [pursuitId, entry] of Object.entries(pursuits as Record<string, unknown>)) {
      const row = normalizePursuitEnrichEntry(entry);
      if (!row) continue;
      const insight = row.insight as Record<string, unknown> | null;
      if (!insight) continue;
      const rawHeadline = typeof insight.headline === "string" ? insight.headline : "";
      normalizedPursuits[pursuitId] = {
        tone: insight.tone,
        headline: clarifyInsightHeadline(rawHeadline),
        body: insight.body,
        ...(typeof insight.comparison === "string" && insight.comparison.trim()
          ? { comparison: insight.comparison.trim().slice(0, PURSUIT_INSIGHT_COMPARISON_MAX) }
          : {}),
        clarifiers: row.clarifiers ?? [],
        suggestedMilestones: row.suggestedMilestones ?? null,
      };
    }
  }

  const themes = root.themes;
  const normalizedThemeOneLiners: string[] = [];
  if (themes && typeof themes === "object" && !Array.isArray(themes)) {
    const normalizedThemes: Record<string, unknown> = {};
    for (const [themeId, entry] of Object.entries(themes as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const oneLiner = typeof row.oneLiner === "string" ? row.oneLiner.trim() : "";
      const reflective = typeof row.reflective === "string" ? row.reflective.trim() : "";
      const contextual = typeof row.contextual === "string" ? row.contextual.trim() : "";
      if (!oneLiner && !reflective) continue;
      const clarifiedOneLiner = clarifyInsightHeadline(truncateThemeOneLiner(oneLiner));
      if (clarifiedOneLiner) normalizedThemeOneLiners.push(clarifiedOneLiner);
      normalizedThemes[themeId] = {
        tone: normalizeThemeTone(row.tone),
        oneLiner: clarifiedOneLiner,
        reflective: truncateAtWordBoundary(reflective, THEME_REFLECTIVE_MAX),
        contextual: truncateAtWordBoundary(contextual, THEME_SUPPLEMENT_MAX),
      };
    }
    root.themes = normalizedThemes;
  }

  if (Object.keys(normalizedPursuits).length > 0) {
    root.pursuits = dedupePursuitHeadlinesAgainstThemes(
      normalizedPursuits,
      normalizedThemeOneLiners,
    );
  }

  const overall = root.overall;
  if (overall && typeof overall === "object" && !Array.isArray(overall)) {
    const row = overall as Record<string, unknown>;
    const oneLiner = typeof row.oneLiner === "string" ? row.oneLiner.trim() : "";
    const support = typeof row.support === "string" ? row.support.trim() : "";
    const trimmedOneLiner = clarifyInsightHeadline(truncateThemeOneLiner(oneLiner));
    const echoesTheme =
      trimmedOneLiner.length > 0 &&
      normalizedThemeOneLiners.length >= 2 &&
      normalizedThemeOneLiners.some((themeOneLiner) =>
        oneLinersRoughlyEqual(trimmedOneLiner, themeOneLiner),
      );
    if (trimmedOneLiner && !echoesTheme) {
      root.overall = {
        tone: normalizeThemeTone(row.tone),
        oneLiner: trimmedOneLiner,
        support: truncateAtWordBoundary(support, OVERALL_SUPPORT_MAX),
      };
    } else {
      delete root.overall;
    }
  }

  return root;
}
