import type { PursuitEnrichResult } from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";
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
  description: string;
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
  description: string | null;
  enrichAnswers: unknown;
  deadline: Date | null;
  status: string;
  targetAmount: number | null;
  milestones: { completedAt: Date | null }[];
}): PursuitSignal {
  const milestones = goal.milestones ?? [];
  return {
    title: goal.title,
    description: goal.description ?? "",
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
 * Milestone suggestions use shouldSuggestMilestones — decoupled from this gate.
 */
export function hasMinimumContextSignal(signal: PursuitSignal): boolean {
  const contextChars =
    signal.description.trim().length + signal.enrichAnswerCount * 40;
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

/** Strip theme contextual when benchmark preconditions are not met. */
export function gateThemeContextual(
  contextual: string,
  _pursuitSignals: PursuitSignal[],
  gate?: ThemeContextualGateInput,
): string {
  if (!contextual.trim()) return "";
  if (gate && !gate.benchmarkApplicable) return "";
  if (!gate && !_pursuitSignals.some(hasMinimumContextSignal)) return "";
  return contextual.trim();
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

/** Strip legacy editorial Comparison copy that is not a concrete benchmark. */
export function gateThemeContextualContent(contextual: string): string {
  const text = contextual.trim();
  if (!text) return "";
  const editorial =
    /\b(pivot|deliberate(?:ly)?|shows commitment|competitive market|holistic commitment|valued in a|demonstrates dedication|career narrative)\b/i;
  if (editorial.test(text)) return "";
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

  if (hasPursuitBenchmarkSignal(signal, profile)) return cleaned;
  if (looksLikeQuantifiedWorthKnowing(cleaned)) return "";
  return cleaned;
}

/** Milestone suggestions when path has room to grow. AI-only — never blocks manual milestone add. */
export function shouldSuggestMilestones(signal: PursuitSignal): boolean {
  if (signal.hasQuantifiedTarget) return false;
  if (signal.milestoneCount >= MILESTONE_MAP_CAP) return false;

  if (signal.milestoneCount === 0) return true;

  // Gap-fill while the path is unfinished, or extend when under cap.
  if (signal.completedMilestoneCount < signal.milestoneCount) return true;
  return signal.milestoneCount < MILESTONE_MAP_CAP;
}

export type QuickQuestionGateContext = {
  status?: string;
  quickQuestionsQuietUntil?: string | null;
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
    isQuickQuestionsQuiet(qqContext?.quickQuestionsQuietUntil)
      ? []
      : result.clarifiers;

  const suggestedMilestones = shouldSuggestMilestones(signal)
    ? result.suggestedMilestones
    : null;

  return {
    clarifiers,
    insight: result.insight,
    suggestedMilestones,
  };
}
