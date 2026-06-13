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
        clarifiers: row.clarifiers ?? [],
        suggestedMilestones: row.suggestedMilestones ?? null,
      };
    }
    root.pursuits = normalized;
  }

  return root;
}
