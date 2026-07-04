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
  return facts;
}

export function formatChapterAgeFactsBlock(facts: ChapterAgeFact[]): string | null {
  if (facts.length === 0) return null;
  const lines = [
    "Authoritative ages when chapters started — use for past starts; never substitute today's Age: line.",
    ...facts.map(
      (fact) =>
        `${fact.title}: Timeline started ${fact.timelineStart}, age at start ${fact.ageAtStart}`,
    ),
  ];
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
