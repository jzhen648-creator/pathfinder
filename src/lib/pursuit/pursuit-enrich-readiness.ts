import type { PursuitEnrichResult, EnrichAnswer } from "@/lib/pursuit/pursuit-enrich-types";
import { truncatePursuitInsightHeadline } from "@/lib/insights/clamp-insight-json";
import { filterActiveClarifiers } from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { isMilestoneReadinessReady } from "@/lib/pursuit/milestone-readiness";
import type { QuestionSlot } from "@/lib/pursuit/pick-question-slot";

/** Interim cap on milestones stored on the map — audit may raise/adjust. */
export const MILESTONE_MAP_CAP = 8;

/** Default quiet period after a quick-question batch is worked through. */
export const QUICK_QUESTIONS_COOLDOWN_DAYS = 7;

const MS_PER_DAY = 86_400_000;

export function computeQuickQuestionsQuietUntil(from = Date.now()): string {
  return new Date(from + QUICK_QUESTIONS_COOLDOWN_DAYS * MS_PER_DAY).toISOString();
}

export function isQuickQuestionsQuiet(quietUntil: string | null | undefined, now = Date.now()): boolean {
  if (!quietUntil?.trim()) return false;
  const until = Date.parse(quietUntil);
  return Number.isFinite(until) && until > now;
}

/** Stamp or clear cooldown on insight-cache pursuit rows after generation. */
export function resolveQuickQuestionsQuietUntilAfterGeneration(input: {
  slot: QuestionSlot;
  clarifiers: PursuitEnrichResult["clarifiers"];
  previousQuietUntil?: string | null;
}): string | undefined {
  if (input.clarifiers.length > 0) {
    return undefined;
  }
  if (input.slot === "none") {
    return input.previousQuietUntil?.trim() || undefined;
  }
  return computeQuickQuestionsQuietUntil();
}

export type PursuitSignal = {
  title: string;
  background?: string | null;
  backgroundChars: number;
  enrichAnswerCount: number;
  milestoneCount: number;
  completedMilestoneCount: number;
  hasDeadline: boolean;
  hasQuantifiedTarget: boolean;
  status: string;
};

function parseEnrichAnswerCount(raw: unknown): number {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data.length : 0;
}

export function pursuitSignalFromGoal(goal: {
  title: string;
  background?: string | null;
  enrichAnswers: unknown;
  deadline: Date | null;
  status: string;
  targetAmount: number | null;
  milestones: { completedAt: Date | null }[];
}): PursuitSignal {
  const milestones = goal.milestones ?? [];
  const background = (goal.background ?? "").trim();
  return {
    title: goal.title,
    background: background || null,
    backgroundChars: background.length,
    enrichAnswerCount: parseEnrichAnswerCount(goal.enrichAnswers),
    milestoneCount: milestones.length,
    completedMilestoneCount: milestones.filter((m) => m.completedAt != null).length,
    hasDeadline: goal.deadline != null,
    hasQuantifiedTarget: (goal.targetAmount ?? 0) > 0,
    status: goal.status,
  };
}

/**
 * Minimum user context before theme benchmarks and pursuit comparison fields fire.
 * Quick-question answers (enrichAnswerCount) count toward this bar.
 * Milestone suggestions use shouldSuggestMilestones — gated by computeMilestoneReadiness when path is empty.
 */
export function hasMinimumContextSignal(signal: PursuitSignal): boolean {
  const contextChars = signal.backgroundChars + signal.enrichAnswerCount * 40;
  if (contextChars >= 80) return true;
  if (signal.enrichAnswerCount >= 2) return true;
  if (signal.hasDeadline && signal.title.trim().length >= 8) return true;
  return false;
}

/** Min pursuits with user context before whole-map holistic benchmark prompt fires. */
export const HOLISTIC_BENCHMARK_MIN_RICH_PURSUITS = 2;

export type BenchmarkProfileContext = {
  age: number | null;
  location: string | null;
};

export function hasBenchmarkProfileContext(profile?: BenchmarkProfileContext): boolean {
  return profile?.age != null && Boolean(profile.location?.trim());
}

export function countMinimumContextSignals(signals: PursuitSignal[]): number {
  return signals.filter(hasMinimumContextSignal).length;
}

/** Looser bar for pursuit/theme Comparison fields when age+location are known. */
export function hasPursuitBenchmarkSignal(
  signal: PursuitSignal,
  profile?: BenchmarkProfileContext,
): boolean {
  if (hasMinimumContextSignal(signal)) return true;
  if (!hasBenchmarkProfileContext(profile)) return false;
  if (signal.hasQuantifiedTarget || signal.hasDeadline) return true;
  if (signal.enrichAnswerCount >= 1) return true;
  if (signal.milestoneCount >= 1 || signal.completedMilestoneCount >= 1) return true;
  return signal.title.trim().length >= 10;
}

export function isHolisticBenchmarkEligible(
  signals: PursuitSignal[],
  profile?: BenchmarkProfileContext,
): boolean {
  if (hasBenchmarkProfileContext(profile)) return true;
  return countMinimumContextSignals(signals) >= HOLISTIC_BENCHMARK_MIN_RICH_PURSUITS;
}

export type ThemeContextualGateInput = {
  themeId: string;
  age: number | null;
  location: string | null;
  benchmarkApplicable: boolean;
};

/** Gate theme worth-knowing (JSON key `contextual`): strip prescriptive/editorial/trivial alignment; quantified needs benchmark signal. */
export function gateThemeContextual(
  contextual: string,
  pursuitSignals: PursuitSignal[],
  gate?: ThemeContextualGateInput,
): string {
  const text = contextual.trim();
  if (!text) return "";

  const cleaned = gateThemeContextualContent(text);
  if (!cleaned) return "";

  if (gate?.benchmarkApplicable) return cleaned;
  if (looksLikeQuantifiedWorthKnowing(cleaned)) return "";
  if (gate && !gate.benchmarkApplicable) return cleaned;
  if (!gate && pursuitSignals.some(hasMinimumContextSignal)) return cleaned;
  return "";
}

/** Strip theme combined unless a user-confirmed link touches the theme. */
export function gateThemeCombined(
  combined: string,
  hasConfirmedLinksInTheme: boolean,
): string {
  if (!combined.trim()) return "";
  if (!hasConfirmedLinksInTheme) return "";
  return combined.trim();
}

/** Strip legacy editorial or trivial-alignment copy from theme/chapter worth-knowing fields. */
export function gateThemeContextualContent(contextual: string): string {
  const text = contextual.trim();
  if (!text) return "";
  const editorial =
    /\b(pivot|deliberate(?:ly)?|shows commitment|competitive market|holistic commitment|valued in a|demonstrates dedication|career narrative)\b/i;
  if (editorial.test(text)) return "";
  const trivialAlignment =
    /\baligns?\s+with\b.*\b(limit|allowance|subscription)\b/i;
  if (trivialAlignment.test(text)) return "";
  return text;
}

export type ThemeLinkGateRow = {
  goalAId: string;
  goalBId: string;
  label: string | null;
  goalATitle: string;
  goalBTitle: string;
};

/** Remove user-confirmed link prose from reflective — links belong in combined only. */
export function gateThemeReflective(
  reflective: string,
  themeId: string,
  relationships: ThemeLinkGateRow[],
  pursuitIdToThemeId: Map<string, string>,
): string {
  const text = reflective.trim();
  if (!text) return "";

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) return text;

  const kept = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    for (const rel of relationships) {
      const inTheme =
        pursuitIdToThemeId.get(rel.goalAId) === themeId ||
        pursuitIdToThemeId.get(rel.goalBId) === themeId;
      if (!inTheme) continue;

      const label = rel.label?.trim();
      if (label && lower.includes(label.toLowerCase())) return false;

      const titleA = rel.goalATitle.trim();
      const titleB = rel.goalBTitle.trim();
      if (
        titleA &&
        titleB &&
        lower.includes(titleA.toLowerCase()) &&
        lower.includes(titleB.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  return kept.join(" ").trim();
}

const PRESCRIPTIVE_WORTH_KNOWING =
  /\b(you should|consider|I recommend|try|add a pursuit)\b/i;

const DEFINITIONAL_WORTH_KNOWING =
  /\b(typically involves?|roles? involve|what a .+ is|is the standard qualification|are generally|matching clients with|in an estate agency)\b/i;

const CONSEQUENTIAL_WORTH_KNOWING =
  /\b(opens|unlocks|positions|enables|makes possible|on (?:your|the) map|your .+ pursuit|between your|given your)\b/i;

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

const PROSE_STOP_WORDS = new Set([
  ...TITLE_STOP_WORDS,
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "your",
  "you",
  "this",
  "that",
  "with",
  "from",
  "into",
]);

function significantProseTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9£]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !PROSE_STOP_WORDS.has(token));
}

/** @internal Exported for vitest — sentence overlaps enrichAnswer selectedOption tokens. */
export function sentenceRestatesEnrichAnswer(sentence: string, enrichAnswers: EnrichAnswer[]): boolean {
  const sentenceTokens = significantProseTokens(sentence);
  if (sentenceTokens.length === 0) return false;

  for (const answer of enrichAnswers) {
    const optionTokens = significantProseTokens(answer.selectedOption);
    if (optionTokens.length === 0) continue;
    const matched = optionTokens.filter((token) => sentenceTokens.includes(token));
    if (matched.length >= Math.min(2, optionTokens.length)) return true;
    if (matched.length / optionTokens.length >= 0.6) return true;
  }
  return false;
}

function fallbackHeadlineFromFocalFacts(focalFacts: string[] | undefined): string | undefined {
  if (!focalFacts?.length) return undefined;
  const candidate = focalFacts.find((fact) => !fact.startsWith("Status:")) ?? focalFacts[0];
  return truncatePursuitInsightHeadline(candidate);
}

/** Strip enrichAnswer restatements from pursuit headline/body after generation. */
export function gatePursuitInsightProse(input: {
  headline?: string;
  body?: string;
  enrichAnswers: EnrichAnswer[];
  focalFacts?: string[];
}): { headline?: string; body?: string } {
  if (input.enrichAnswers.length === 0) {
    return {
      headline: input.headline?.trim() || undefined,
      body: input.body?.trim() || undefined,
    };
  }

  let headline = input.headline?.trim() ?? "";
  let body = input.body?.trim() ?? "";

  if (headline && sentenceRestatesEnrichAnswer(headline, input.enrichAnswers)) {
    headline = fallbackHeadlineFromFocalFacts(input.focalFacts) ?? "";
  }

  if (body) {
    const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
    body = sentences
      .filter((sentence) => !sentenceRestatesEnrichAnswer(sentence, input.enrichAnswers))
      .join(" ")
      .trim();
  }

  return {
    headline: headline || undefined,
    body: body || undefined,
  };
}

/** @internal Exported for vitest — reflective sentence paraphrases theme oneLiner. */
export function sentenceParaphrasesHeadline(sentence: string, oneLiner: string): boolean {
  const headlineTokens = significantProseTokens(oneLiner);
  if (headlineTokens.length === 0) return false;

  const sentenceTokens = significantProseTokens(sentence);
  if (sentenceTokens.length === 0) return false;

  const matched = headlineTokens.filter((token) => sentenceTokens.includes(token));
  if (matched.length >= Math.min(2, headlineTokens.length)) return true;
  return matched.length / headlineTokens.length >= 0.6;
}

/** Strip reflective sentences that paraphrase the theme oneLiner after generation. */
export function gateThemeInsightProse(input: {
  oneLiner?: string;
  reflective?: string;
}): { oneLiner?: string; reflective?: string } {
  const oneLiner = input.oneLiner?.trim() ?? "";
  let reflective = input.reflective?.trim() ?? "";

  if (oneLiner && reflective) {
    const sentences = reflective.split(/(?<=[.!?])\s+/).filter(Boolean);
    reflective = sentences
      .filter((sentence) => !sentenceParaphrasesHeadline(sentence, oneLiner))
      .join(" ")
      .trim();
  }

  return {
    oneLiner: oneLiner || undefined,
    reflective: reflective || undefined,
  };
}

function significantTitleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9£]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token));
}

/** @internal Exported for vitest — encyclopedia-style worth-knowing without map anchor. */
export function looksLikeDefinitionalWorthKnowing(text: string): boolean {
  return DEFINITIONAL_WORTH_KNOWING.test(text.trim());
}

/** @internal Exported for vitest — pursuit/map anchor in worth-knowing copy. */
export function hasWorthKnowingAnchor(text: string, signal: PursuitSignal): boolean {
  const lower = text.toLowerCase();
  if (CONSEQUENTIAL_WORTH_KNOWING.test(lower)) return true;
  if (/\bon the map\b/.test(lower)) return true;

  // Title-word overlap in definitional gloss still repeats the header — not a map anchor.
  if (looksLikeDefinitionalWorthKnowing(text)) return false;

  const titleTokens = significantTitleTokens(signal.title);
  if (titleTokens.length === 0) return false;
  const matched = titleTokens.filter((token) => lower.includes(token));
  return matched.length >= Math.min(2, titleTokens.length);
}

/** Quantified population benchmarks still need benchmark signal; qualitative domain may pass without it. */
export function looksLikeQuantifiedWorthKnowing(text: string): boolean {
  return /\b(\d+\s*%|\d[\d,]*\s*(?:months?|weeks?|years?|days?)|percentile|median|typical\s+(?:time|prep|is)\s+(?:is\s+)?\d|\d+\s*-\s*\d+\s*(?:months?|weeks?|years?))/i.test(
    text,
  );
}

/** Gate pursuit worth-knowing (JSON key `comparison`): strip prescriptive/editorial; keep qualitative domain without benchmark signal. */
export function gatePursuitComparison(
  comparison: string,
  signal: PursuitSignal,
  profile?: BenchmarkProfileContext,
): string {
  const text = comparison.trim();
  if (!text) return "";
  if (PRESCRIPTIVE_WORTH_KNOWING.test(text)) return "";

  const cleaned = gateThemeContextualContent(text);
  if (!cleaned) return "";

  if (looksLikeDefinitionalWorthKnowing(cleaned) && !hasWorthKnowingAnchor(cleaned, signal)) {
    return "";
  }

  if (hasPursuitBenchmarkSignal(signal, profile)) return cleaned;
  if (looksLikeQuantifiedWorthKnowing(cleaned)) return "";
  return cleaned;
}

/** Milestone suggestions when path has room to grow. AI-only — never blocks manual milestone add. */
export function shouldSuggestMilestones(signal: PursuitSignal): boolean {
  if (signal.hasQuantifiedTarget) return false;
  if (signal.milestoneCount >= MILESTONE_MAP_CAP) return false;

  if (signal.milestoneCount === 0) {
    return isMilestoneReadinessReady(signal);
  }

  // Gap-fill while the path is unfinished, or extend when under cap.
  if (signal.completedMilestoneCount < signal.milestoneCount) return true;
  return signal.milestoneCount < MILESTONE_MAP_CAP;
}

export type QuickQuestionGateContext = {
  status?: string;
  quickQuestionsQuietUntil?: string | null;
  enrichAnswers?: EnrichAnswer[];
  focalFacts?: string[];
};

export function gateEnrichResult(
  result: PursuitEnrichResult,
  signal: PursuitSignal,
  enrichOptions?: PursuitEnrichOptions,
  qqContext?: QuickQuestionGateContext,
): PursuitEnrichResult {
  const options = resolvePursuitEnrichOptions(enrichOptions);
  const status = qqContext?.status ?? signal.status;

  const clarifiers =
    !options.clarifyTitles ||
    status === "PAUSED" ||
    status === "COMPLETE" ||
    isQuickQuestionsQuiet(qqContext?.quickQuestionsQuietUntil)
      ? []
      : filterActiveClarifiers(result.clarifiers);

  const suggestedMilestones = shouldSuggestMilestones(signal)
    ? result.suggestedMilestones
    : null;

  let insight = result.insight;
  if (insight && qqContext?.enrichAnswers?.length) {
    const prose = gatePursuitInsightProse({
      headline: insight.headline,
      body: insight.body,
      enrichAnswers: qqContext.enrichAnswers,
      focalFacts: qqContext.focalFacts,
    });
    insight = {
      ...insight,
      headline: prose.headline ?? insight.headline,
      body: prose.body ?? insight.body,
    };
  }

  return {
    clarifiers,
    insight,
    suggestedMilestones,
  };
}
