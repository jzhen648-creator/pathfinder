import { z } from "zod";
import { LIFE_AREAS, formatThemeDisplayNamesForPrompt } from "@/lib/life-areas";
import { clampSignificance } from "@/lib/pursuit/significance";

/**
 * Import cold-start: free text (a pasted conversation, a brain-dump, a
 * spoken ramble transcribed) → several *drafted* chapters the user curates.
 *
 * Stateless by design. This endpoint persists nothing — it returns
 * candidates the client feeds into the existing create flow, one confirm
 * at a time. The user stays the author (PROJECT.md: relax how people get
 * IN, never what protects them once inside). Broadening move #1 in
 * docs/POSITIONING.md.
 */

export const MAX_IMPORT_TEXT_CHARS = 20_000;
export const MAX_DRAFT_CHAPTERS = 12;

const VALID_THEME_IDS = new Set<string>(LIFE_AREAS.map((a) => a.id));

export const importDraftRequestSchema = z.object({
  text: z.string().trim().min(1, "text is required").max(MAX_IMPORT_TEXT_CHARS),
});

export type ImportDraftRequest = z.infer<typeof importDraftRequestSchema>;

export type DraftChapter = {
  title: string;
  themeId: string;
  significance: number;
  /** ISO date if the source clearly implies one, else null. */
  targetDate: string | null;
  /** 0–1 — model's confidence this is a real chapter worth drafting. */
  confidence: number;
};

export type ImportDraftResponse = {
  chapters: DraftChapter[];
};

export function buildImportDraftSystemPrompt(): string {
  return [
    "You read a person's free-form writing or speech (a pasted conversation, a",
    "brain-dump, journal notes) and extract the distinct life pursuits — 'chapters' —",
    "it describes. A chapter is an ongoing or completed pursuit in someone's life:",
    "a goal, a project, a relationship focus, a health effort, a financial aim.",
    "",
    "Return ONLY a JSON object: { \"chapters\": [ ... ] }. Each chapter has:",
    "- title (string): concise, in the user's own framing. No trailing punctuation.",
    "- themeId (string): one of the theme ids below — pick the best fit.",
    "- significance (integer 1-3): how central this seems to their life.",
    "- targetDate (ISO date string or null): only if a date is clearly implied.",
    "- confidence (number 0-1): how sure you are this is a real, distinct chapter.",
    "",
    "Theme ids:",
    formatThemeDisplayNamesForPrompt(),
    "",
    "Rules:",
    "- Extract only what the text actually supports. Do NOT invent chapters,",
    "  connections between them, or details the person did not say.",
    "- Merge duplicates; keep each chapter distinct. At most 12 chapters.",
    "- Prefer fewer, real chapters over many thin ones. Skip vague musings that",
    "  are not a pursuit.",
    "- These are DRAFTS the person will review and edit — title plainly, do not",
    "  embellish or motivate. No text outside the JSON object.",
  ].join("\n");
}

const rawChapterSchema = z.object({
  title: z.unknown(),
  themeId: z.unknown(),
  significance: z.unknown(),
  targetDate: z.unknown().optional(),
  confidence: z.unknown().optional(),
});

const rawResponseSchema = z.object({
  chapters: z.array(rawChapterSchema).optional().default([]),
});

function coerceTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[.\s]+$/, "");
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

function coerceThemeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return VALID_THEME_IDS.has(id) ? id : null;
}

function coerceIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function coerceConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Normalize the model's raw JSON into safe drafts. Drops chapters with no
 * usable title or an unknown theme (invented themes are not surfaced),
 * dedupes by title within a theme, and caps the list.
 */
export function normalizeImportDraftResponse(raw: unknown): ImportDraftResponse {
  const parsed = rawResponseSchema.safeParse(raw);
  if (!parsed.success) return { chapters: [] };

  const seen = new Set<string>();
  const chapters: DraftChapter[] = [];

  for (const row of parsed.data.chapters) {
    const title = coerceTitle(row.title);
    const themeId = coerceThemeId(row.themeId);
    if (!title || !themeId) continue;

    const dedupeKey = `${themeId}::${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    chapters.push({
      title,
      themeId,
      significance: clampSignificance(
        typeof row.significance === "number" ? row.significance : Number(row.significance) || 1,
      ),
      targetDate: coerceIsoDate(row.targetDate),
      confidence: coerceConfidence(row.confidence),
    });

    if (chapters.length >= MAX_DRAFT_CHAPTERS) break;
  }

  return { chapters };
}
