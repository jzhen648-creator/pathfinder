import { normalizePursuitEnrichEntry } from "@/lib/pursuit/normalize-pursuit-enrich";
import { REFLECT_READING_MAX_CHARS } from "@/lib/ai/reflect-types";

function truncateReading(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= REFLECT_READING_MAX_CHARS
    ? trimmed
    : trimmed.slice(0, REFLECT_READING_MAX_CHARS).trimEnd();
}

/** Coerce Gemini reflect JSON before Zod — reuse pursuit enrich normalizer for panel entries. */
export function normalizeReflectResponse(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  root.reading = truncateReading(root.reading ?? root.seasonRead);

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
        ...(typeof insight.fromMap === "string" && insight.fromMap.trim()
          ? { fromMap: insight.fromMap.trim().slice(0, 200) }
          : {}),
        ...(typeof insight.comparison === "string" && insight.comparison.trim()
          ? { comparison: insight.comparison.trim().slice(0, 200) }
          : {}),
        clarifiers: row.clarifiers ?? [],
        suggestedMilestones: row.suggestedMilestones ?? null,
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
        tone: row.tone ?? "encouraging",
        oneLiner: oneLiner.slice(0, 100),
        reflective: reflective.slice(0, 500),
        contextual: typeof row.contextual === "string" ? row.contextual.slice(0, 500) : "",
        combined: typeof row.combined === "string" ? row.combined.slice(0, 500) : "",
      };
    }
    root.themes = normalizedThemes;
  }

  return root;
}
