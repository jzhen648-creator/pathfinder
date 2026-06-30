import { normalizePursuitEnrichEntry } from "@/lib/pursuit/normalize-pursuit-enrich";
import { PURSUIT_INSIGHT_COMPARISON_MAX } from "@/lib/insights/insight-field-limits";

const THEME_TONES = ["encouraging", "nudge", "celebratory"] as const;

export const THEME_ONE_LINER_MAX = 140;
const THEME_REFLECTIVE_MAX = 800;

/** Trim text to max length on a word boundary; append … when shortened. */
export function truncateAtWordBoundary(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const budget = max - 1;
  let slice = trimmed.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) {
    slice = slice.slice(0, lastSpace);
  }
  return `${slice.trimEnd()}…`;
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

/** Coerce Gemini reflect JSON before Zod — reuse pursuit enrich normalizer for panel entries. */
export function normalizeReflectResponse(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  const pursuits = root.pursuits;
  if (pursuits && typeof pursuits === "object" && !Array.isArray(pursuits)) {
    const normalized: Record<string, unknown> = {};
    for (const [pursuitId, entry] of Object.entries(pursuits as Record<string, unknown>)) {
      const row = normalizePursuitEnrichEntry(entry);
      if (!row) continue;
      const insight = row.insight as Record<string, unknown> | null;
      if (!insight) continue;
      normalized[pursuitId] = {
        tone: insight.tone,
        headline: insight.headline,
        body: insight.body,
        ...(typeof insight.comparison === "string" && insight.comparison.trim()
          ? { comparison: insight.comparison.trim().slice(0, PURSUIT_INSIGHT_COMPARISON_MAX) }
          : {}),
        clarifiers: row.clarifiers ?? [],
        suggestedMilestones: row.suggestedMilestones ?? null,
        suggestedContinuations: row.suggestedContinuations ?? [],
      };
    }
    root.pursuits = normalized;
  }

  const themes = root.themes;
  if (themes && typeof themes === "object" && !Array.isArray(themes)) {
    const normalizedThemes: Record<string, unknown> = {};
    for (const [themeId, entry] of Object.entries(themes as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const oneLiner = typeof row.oneLiner === "string" ? row.oneLiner.trim() : "";
      const reflective = typeof row.reflective === "string" ? row.reflective.trim() : "";
      if (!oneLiner && !reflective) continue;
      normalizedThemes[themeId] = {
        tone: normalizeThemeTone(row.tone),
        oneLiner: truncateThemeOneLiner(oneLiner),
        reflective: truncateAtWordBoundary(reflective, THEME_REFLECTIVE_MAX),
        contextual: "",
        combined: "",
      };
    }
    root.themes = normalizedThemes;
  }

  return root;
}
