import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import { ageAtCalendarDate } from "@/lib/map/compile-reading-packet";

export type ChapterAgeFact = {
  title: string;
  themeId: string;
  timelineStart: string;
  ageAtStart: number;
};

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "at",
  "as",
  "in",
  "on",
  "for",
  "to",
  "of",
  "and",
  "or",
]);

const PAST_TRANSITION_HINT =
  /\b(moved|transition|from formal|from education|into|apprenticeship|qualification|career|role|job)\b/i;

const EXPLICIT_START_AT_AGE =
  /\b((?:starting|started|beginning|began|commenced)\b[^.!?]{0,140}?\bat\s+(?:age\s+)?)(\d+)\b/gi;

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

/** Year-only entries often default to Jan 1 — do not invent sub-year intervals from them. */
export function isYearPrecisionOnly(timelineStart: string): boolean {
  return /^\d{4}-01-01$/.test(timelineStart.trim());
}

function calendarYear(ymd: string): number | null {
  return parseYmd(ymd)?.year ?? null;
}

function hasSubYearPrecision(ymd: string): boolean {
  const parts = parseYmd(ymd);
  if (!parts) return false;
  return !(parts.month === 1 && parts.day === 1);
}

function yearDeltaBetween(startA: string, startB: string): number | null {
  const yearA = calendarYear(startA);
  const yearB = calendarYear(startB);
  if (yearA == null || yearB == null) return null;
  return yearB - yearA;
}

function voicingHintForStep(
  fact: ChapterAgeFact,
  previous: ChapterAgeFact | null,
): string {
  if (!previous) {
    return `${fact.title} — age ${fact.ageAtStart} (anchor)`;
  }

  const sameAge = fact.ageAtStart === previous.ageAtStart;
  const prevYear = calendarYear(previous.timelineStart);
  const currYear = calendarYear(fact.timelineStart);
  const sameCalendarYear = prevYear != null && currYear != null && prevYear === currYear;
  const ageDelta = fact.ageAtStart - previous.ageAtStart;
  const yearDelta = yearDeltaBetween(previous.timelineStart, fact.timelineStart);

  if (sameAge && sameCalendarYear) {
    const subYearOk =
      hasSubYearPrecision(previous.timelineStart) && hasSubYearPrecision(fact.timelineStart);
    if (subYearOk) {
      return `${fact.title} — same age (${fact.ageAtStart}), same year → use "that same year" / "soon after" (do not restate the age)`;
    }
    return `${fact.title} — same age (${fact.ageAtStart}), same year → use "that same year" (do not restate the age)`;
  }

  if (sameAge && !sameCalendarYear) {
    return `${fact.title} — still age ${fact.ageAtStart}, later year → relative marker OK; do not repeat the number unless it helps clarity`;
  }

  if (ageDelta > 0) {
    const yearsOn =
      yearDelta != null && yearDelta > 0
        ? `${yearDelta} year${yearDelta === 1 ? "" : "s"} on`
        : "later";
    return `${fact.title} — age ${fact.ageAtStart} (${yearsOn}) → state the new age`;
  }

  return `${fact.title} — age ${fact.ageAtStart} → state the age if it anchors the sequence`;
}

function significantTitleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9£]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token));
}

function bestMatchingFact(sentence: string, facts: ChapterAgeFact[]): ChapterAgeFact | null {
  const lower = sentence.toLowerCase();
  let best: ChapterAgeFact | null = null;
  let bestScore = 0;
  for (const fact of facts) {
    const tokens = significantTitleTokens(fact.title);
    if (tokens.length === 0) continue;
    const matched = tokens.filter((token) => lower.includes(token));
    const score = matched.length;
    if (score > bestScore) {
      bestScore = score;
      best = fact;
    }
  }
  return bestScore >= 1 ? best : null;
}

/** All user-set chapter starts with precomputed age-at-start for AI prompts and post-gen gates. */
export function collectChapterAgeFacts(
  mapContext: FormattedMapContext,
  dateOfBirth: Date | null,
): ChapterAgeFact[] {
  if (!dateOfBirth) return [];
  const facts: ChapterAgeFact[] = [];
  for (const theme of mapContext.themes) {
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        if (!pursuit.timelineStart) continue;
        const ageAtStart = ageAtCalendarDate(dateOfBirth, pursuit.timelineStart);
        if (ageAtStart == null) continue;
        facts.push({
          title: pursuit.title,
          themeId: theme.id,
          timelineStart: pursuit.timelineStart,
          ageAtStart,
        });
      }
    }
  }
  return facts.sort((a, b) => a.timelineStart.localeCompare(b.timelineStart));
}

export function formatChapterAgeFactsBlock(facts: ChapterAgeFact[]): string | null {
  if (facts.length === 0) return null;

  const sorted = [...facts].sort((a, b) => a.timelineStart.localeCompare(b.timelineStart));
  const lines = [
    "Chronology (ages are anchors; do not restate an age that has not changed):",
    "Authoritative ages when chapters started — use for past starts; never substitute today's Age: line.",
  ];

  for (let i = 0; i < sorted.length; i += 1) {
    const fact = sorted[i]!;
    const previous = i > 0 ? sorted[i - 1]! : null;
    lines.push(`- ${voicingHintForStep(fact, previous)}`);
    lines.push(
      `  ${fact.title}: Timeline started ${fact.timelineStart}, age at start ${fact.ageAtStart}`,
    );
  }

  return lines.join("\n");
}

/**
 * Fix or strip prose that applies today's age to a chapter start date.
 * e.g. "Starting apprenticeship at 19" when age at start was 17.
 */
export function gateMisappliedCurrentAgeProse(
  text: string,
  currentAge: number | null,
  chapterAgeFacts: ChapterAgeFact[],
): string {
  const trimmed = text.trim();
  if (!trimmed || currentAge == null || chapterAgeFacts.length === 0) return trimmed;

  const misappliedFacts = chapterAgeFacts.filter((fact) => fact.ageAtStart !== currentAge);
  if (misappliedFacts.length === 0) return trimmed;

  let result = trimmed.replace(EXPLICIT_START_AT_AGE, (match, prefix: string, ageStr: string) => {
    const age = Number.parseInt(ageStr, 10);
    if (!Number.isFinite(age) || age !== currentAge) return match;
    const fact = bestMatchingFact(match, misappliedFacts) ?? misappliedFacts[0];
    if (!fact || fact.ageAtStart === currentAge) return match;
    return `${prefix}${fact.ageAtStart}`;
  });

  const leadingAtCurrent = new RegExp(`^At\\s+(?:age\\s+)?${currentAge}\\s*,\\s*`, "i");
  if (leadingAtCurrent.test(result)) {
    const withoutPrefix = result.replace(leadingAtCurrent, "").trim();
    const fact = bestMatchingFact(withoutPrefix, misappliedFacts);
    if (fact && PAST_TRANSITION_HINT.test(withoutPrefix)) {
      result = withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
    }
  }

  return result.trim();
}
