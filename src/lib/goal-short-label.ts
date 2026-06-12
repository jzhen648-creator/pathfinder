import { formatCanvasLabelForDisplay } from "@/lib/canvas-label-display";
import { labelPreservesSalience } from "@/lib/canvas-label-salience";
import { prisma } from "@/lib/prisma";

const SHORT_LABEL_MAX_CHARS = 72;
const MAX_WORDS = 6;

const FILLER_PREFIXES = [
  "get a ",
  "get an ",
  "get my ",
  "get ",
  "build a ",
  "build an ",
  "build my ",
  "build ",
  "start a ",
  "start an ",
  "start my ",
  "start ",
  "complete ",
  "establish ",
  "develop ",
  "create a ",
  "create an ",
  "create my ",
  "create ",
  "achieve ",
  "become ",
  "find a ",
  "find an ",
  "find my ",
  "find ",
  "launch ",
  "resolve ",
  "secure ",
] as const;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "our",
  "your",
  "and",
  "or",
  "of",
  "for",
  "to",
  "at",
  "on",
  "with",
  "by",
  "before",
  "after",
  "from",
  "into",
  "about",
  "around",
  "towards",
  "toward",
  "through",
  "via",
  "in",
  "up",
  "out",
  "goal",
  "pursuit",
  "plan",
  "thing",
  "stuff",
  "something",
  "properly",
  "better",
  "more",
  "less",
  "new",
  "next",
  "finally",
  "really",
  "maybe",
  "need",
  "want",
  "try",
  "trying",
  "work",
  "working",
  "make",
  "making",
  "move",
  "sort",
  "fix",
  "run",
  "finish",
  "complete",
  "build",
  "create",
  "develop",
  "establish",
  "achieve",
  "reach",
  "have",
  "end",
  "grow",
  "get",
  "start",
  "launch",
  "secure",
]);

const MONTH_WORDS = new Set([
  "jan",
  "january",
  "feb",
  "february",
  "mar",
  "march",
  "apr",
  "april",
  "may",
  "jun",
  "june",
  "jul",
  "july",
  "aug",
  "august",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "nov",
  "november",
  "dec",
  "december",
]);

const DATE_CONTEXT_WORDS = new Set([
  "module",
  "exam",
  "marathon",
  "race",
  "visa",
  "launch",
  "deadline",
  "move",
  "wedding",
  "visit",
]);

type LabelToken = {
  text: string;
  lower: string;
  sourceIndex: number;
  score: number;
  dateLike: boolean;
};

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function stripFillerPrefix(input: string): string {
  let s = input.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const lower = s.toLowerCase();
    for (const prefix of FILLER_PREFIXES) {
      if (lower.startsWith(prefix)) {
        s = s.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

function formatMagnitude(value: number): string {
  const abs = Math.abs(value);
  const compact = (divisor: number, suffix: "k" | "M") => {
    const n = value / divisor;
    const rounded = Math.round(n * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
  };
  if (abs >= 1_000_000) return compact(1_000_000, "M");
  if (abs >= 1_000) return compact(1_000, "k");
  return String(value);
}

function normalizeLargeNumbers(input: string): string {
  const currencyAmount = /([£$€])\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|bn|[kKmM]))?/g;
  const plainAmount = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|bn|[kKmM]))?\b/g;

  const parseAmount = (raw: string, suffix?: string): number | null => {
    const n = Number.parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    const s = suffix?.toLowerCase();
    if (s === "k" || s === "thousand") return n * 1_000;
    if (s === "m" || s === "million") return n * 1_000_000;
    if (s === "bn" || s === "billion") return n * 1_000_000_000;
    return n;
  };

  const withCurrency = input.replace(currencyAmount, (_match, currency: string, raw: string, suffix?: string) => {
    const value = parseAmount(raw, suffix);
    if (value == null || value < 1_000) return `${currency}${raw}`;
    return `${currency}${formatMagnitude(value)}`;
  });

  return withCurrency.replace(plainAmount, (match, raw: string, suffix?: string, offset?: number, full?: string) => {
    const before = typeof offset === "number" && typeof full === "string" ? full[offset - 1] : "";
    if (before && /[£$€]/.test(before)) return match;
    const value = parseAmount(raw, suffix);
    if (value == null || value < 1_000) return match;
    const digits = raw.replace(/,/g, "");
    if (!suffix && /^(19|20)\d{2}$/.test(digits)) return match;
    return formatMagnitude(value);
  });
}

function properNounsFromTitle(title: string): Set<string> {
  const out = new Set<string>();
  const words = title.match(/\b[\p{L}][\p{L}'’-]*\b/gu) ?? [];
  words.forEach((word, index) => {
    const first = word.charAt(0);
    const hasInternalUpper = /[\p{Ll}][\p{Lu}]|[\p{Lu}][\p{Ll}].*[\p{Lu}]/u.test(word);
    const allCaps = word.length > 1 && word === word.toUpperCase();
    const sentenceCaseOnly = index === 0 && !allCaps && !hasInternalUpper;
    if (word.length > 1 && first !== first.toLowerCase() && first === first.toUpperCase()) {
      if (!sentenceCaseOnly) out.add(word.toLowerCase());
    }
  });
  return out;
}

function tokenize(input: string): string[] {
  return (
    input.match(/[A-Za-z]+-\d+(?::\d+)?|[£$€]?\d+(?:\.\d+)?[kKmM]?|[A-Za-z]+(?:[-'][A-Za-z]+)*|\d+(?::\d+)?/g) ?? []
  );
}

function isYear(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

function isDateLike(token: string): boolean {
  return isYear(token) || MONTH_WORDS.has(token.toLowerCase());
}

function isAmountLike(token: string): boolean {
  return /^[£$€]?\d/.test(token) && !isYear(token);
}

function isAcronym(token: string): boolean {
  return /^[A-Z0-9&]{2,}$/.test(token);
}

function dateLooksDifferentiating(tokens: string[]): boolean {
  const lows = tokens.map((t) => t.toLowerCase());
  return lows.some((t) => DATE_CONTEXT_WORDS.has(t));
}

function buildLabelTokens(title: string): LabelToken[] {
  const stripped = stripFillerPrefix(normalizeLargeNumbers(title));
  const rawTokens = tokenize(stripped);
  const proper = properNounsFromTitle(title);
  const keepDates = dateLooksDifferentiating(rawTokens);

  return rawTokens
    .map((text, sourceIndex): LabelToken | null => {
      const lower = text.toLowerCase();
      const dateLike = isDateLike(text);
      const amountLike = isAmountLike(text);
      const properLike = proper.has(lower) || isAcronym(text);

      if (!amountLike && !properLike && !dateLike && FILLER_WORDS.has(lower)) return null;
      if (dateLike && !keepDates) return null;

      let score = 40;
      if (amountLike) score += 70;
      if (properLike) score += 45;
      if (dateLike) score += keepDates ? 25 : -40;
      if (lower.length >= 6) score += 12;
      if (lower.length <= 2 && !amountLike && !properLike) score -= 20;

      return { text, lower, sourceIndex, score, dateLike };
    })
    .filter((token): token is LabelToken => token !== null);
}

function chooseTokens(tokens: LabelToken[]): LabelToken[] {
  if (tokens.length <= MAX_WORDS) return tokens;

  const selected = [...tokens]
    .sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex)
    .slice(0, MAX_WORDS)
    .sort((a, b) => a.sourceIndex - b.sourceIndex);

  if (selected.some((t) => t.dateLike) && selected.length > 4) {
    const withoutExtraDates = selected.filter((t) => !t.dateLike || selected.filter((x) => x.dateLike).indexOf(t) === 0);
    return withoutExtraDates.slice(0, MAX_WORDS);
  }

  return selected;
}

export function generateGoalShortLabel(title: string, description?: string | null): string | null {
  const t = title.trim();
  if (!t) return null;

  const tokens = chooseTokens(buildLabelTokens(t));
  const raw = tokens.map((token) => token.text).join(" ");
  const normalized = normalizeShortLabelCandidate(raw || t, t, description);
  if (normalized) return normalized;

  const fallback = normalizeShortLabelCandidate(
    buildLabelTokens(t)
      .slice(0, MAX_WORDS)
      .map((token) => token.text)
      .join(" "),
    t,
    description,
  );
  return fallback;
}

/**
 * Sanitize model output for tree canvas. Returns null if unusable.
 * @param sourceTitle — original goal title; used to restore proper-noun casing and salience checks.
 * @param sourceDescription — optional goal description for salience and generation context.
 */
export function normalizeShortLabelCandidate(
  raw: string,
  sourceTitle?: string,
  sourceDescription?: string | null,
  maxWords: number = MAX_WORDS,
): string | null {
  let s = raw.trim();
  if (!s) return null;
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Normalize apostrophes, collapse whitespace
  s = s.replace(/[’`]/g, "'").replace(/\s+/g, " ");
  // Strip disallowed punctuation (keep letters, numbers, spaces, apostrophe, currency / common symbols in goals)
  // Letters, numbers, spaces, apostrophe, common currency symbols.
  s = s.replace(/[^\p{L}\p{N}\s'£$€:-]/gu, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const words = countWords(s);
  if (words > maxWords) return null;
  if (s.length > SHORT_LABEL_MAX_CHARS) return null;

  const title = sourceTitle?.trim() || "";
  const formatted = formatCanvasLabelForDisplay(s, title || undefined);
  if (title && !labelPreservesSalience(formatted, title, sourceDescription)) return null;
  return formatted;
}

/** AI canvas label with heuristic fallback when the model returns null or invalid output. */
export function resolvePursuitShortLabel(
  aiShortLabel: string | null | undefined,
  title: string,
  description?: string | null,
): string | null {
  const trimmedAi = typeof aiShortLabel === "string" ? aiShortLabel.trim() : "";
  if (trimmedAi) {
    const fromAi = normalizeShortLabelCandidate(trimmedAi, title, description, 3);
    if (fromAi) return fromAi;
  }
  return generateGoalShortLabel(title, description);
}

/**
 * Fetches latest title, generates label, updates DB only when a valid string is produced
 * (never clears an existing shortLabel on failure).
 */
export async function persistGoalShortLabel(goalId: string): Promise<void> {
  const row = await prisma.goal.findFirst({
    where: { id: goalId },
    select: { id: true, title: true, description: true, goalType: true },
  });
  if (!row) return;
  if (row.goalType === "moment" || row.goalType === "event") return;

  const label = generateGoalShortLabel(row.title, row.description);
  if (!label) return;

  await prisma.goal.update({
    where: { id: goalId },
    data: { shortLabel: label },
  });
}
