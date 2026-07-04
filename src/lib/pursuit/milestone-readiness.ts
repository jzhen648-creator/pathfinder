import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import { QUICK_QUESTION_MIN_NOTE_CHARS } from "@/lib/pursuit/clarifier-prompt-blocks";

export type MilestoneReadinessMissing = "note" | "specifics" | "quick_question";

export type MilestoneReadiness = {
  ready: boolean;
  score: number;
  missing: MilestoneReadinessMissing[];
};

export type MilestoneReadinessInput = {
  title: string;
  background?: string | null;
  enrichAnswerCount: number;
};

const STOP_WORDS = new Set([
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
  "but",
  "with",
  "from",
  "into",
  "this",
  "that",
  "your",
  "you",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "about",
  "just",
  "really",
  "very",
  "want",
  "good",
  "fun",
  "yeah",
]);

const MONTH_WORDS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;

const DATE_HINT = /\b(20\d{2}|19\d{2})\b|\b\d{1,2}[/-]\d{1,2}\b/;

/** Distinct meaningful tokens from prose — shared scoring primitive. */
export function meaningfulTokensFromText(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9£]+/)) {
    const token = raw.trim();
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function countSpecificityMarkers(combinedText: string): number {
  let count = 0;
  const numberMatches = combinedText.match(/\d+/g);
  if (numberMatches) count += numberMatches.length;
  if (/£|\$|€/.test(combinedText)) count += 1;
  if (MONTH_WORDS.test(combinedText)) count += 1;
  if (DATE_HINT.test(combinedText)) count += 1;

  const words = combinedText.split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i]!.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (word.length >= 2 && /^[A-Z][a-z]+/.test(word)) count += 1;
  }

  return count;
}

function isFillerHeavy(input: MilestoneReadinessInput, meaningfulTokenCount: number, specificityMarkers: number): boolean {
  const background = (input.background ?? "").trim();
  return background.length >= 80 && meaningfulTokenCount < 6 && specificityMarkers === 0;
}

function computeMissing(
  input: MilestoneReadinessInput,
  meaningfulTokenCount: number,
  titleTokenCount: number,
  specificityMarkers: number,
): MilestoneReadinessMissing[] {
  const missing: MilestoneReadinessMissing[] = [];
  const background = (input.background ?? "").trim();

  if (background.length < QUICK_QUESTION_MIN_NOTE_CHARS) missing.push("note");
  if (input.enrichAnswerCount === 0) missing.push("quick_question");
  if (specificityMarkers === 0 && titleTokenCount < 3 && meaningfulTokenCount < 8) {
    missing.push("specifics");
  }

  return missing;
}

/** Deterministic specificity score — gates AI milestone suggestions when path is empty. */
export function computeMilestoneReadiness(input: MilestoneReadinessInput): MilestoneReadiness {
  const title = input.title.trim();
  const background = (input.background ?? "").trim();
  const combined = [title, background].filter(Boolean).join(" ");

  const titleTokens = meaningfulTokensFromText(title);
  const combinedTokens = meaningfulTokensFromText(combined);
  const meaningfulTokenCount = combinedTokens.length;
  const specificityMarkers = countSpecificityMarkers(combined);
  const answeredQuestions = input.enrichAnswerCount;

  const fillerBlocked = isFillerHeavy(input, meaningfulTokenCount, specificityMarkers);

  const readyByAnswered =
    answeredQuestions >= 1 && meaningfulTokenCount >= 4;
  const readyByRichNote =
    meaningfulTokenCount >= 8 && specificityMarkers >= 1;
  const readyBySpecificTitle =
    titleTokens.length >= 3 && specificityMarkers >= 1 && meaningfulTokenCount >= 6;

  const ready = !fillerBlocked && (readyByAnswered || readyByRichNote || readyBySpecificTitle);

  const score =
    meaningfulTokenCount * 2 +
    specificityMarkers * 5 +
    answeredQuestions * 8 +
    Math.min(background.length, 120) / 20;

  const missing = ready
    ? []
    : computeMissing(input, meaningfulTokenCount, titleTokens.length, specificityMarkers);

  return { ready, score, missing };
}

export function isMilestoneReadinessReady(signal: PursuitSignal): boolean {
  return computeMilestoneReadiness({
    title: signal.title,
    background: signal.background,
    enrichAnswerCount: signal.enrichAnswerCount,
  }).ready;
}

export function milestoneReadinessFromSignal(signal: PursuitSignal): MilestoneReadiness {
  return computeMilestoneReadiness({
    title: signal.title,
    background: signal.background,
    enrichAnswerCount: signal.enrichAnswerCount,
  });
}
