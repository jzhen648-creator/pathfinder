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

export function countMinimumContextSignals(signals: PursuitSignal[]): number {
  return signals.filter(hasMinimumContextSignal).length;
}

export function isHolisticBenchmarkEligible(signals: PursuitSignal[]): boolean {
  return countMinimumContextSignals(signals) >= HOLISTIC_BENCHMARK_MIN_RICH_PURSUITS;
}

/** Strip theme contextual benchmarks when no pursuit in the theme has enough user context. */
export function gateThemeContextual(
  contextual: string,
  pursuitSignals: PursuitSignal[],
): string {
  if (!contextual.trim()) return "";
  if (pursuitSignals.some(hasMinimumContextSignal)) return contextual.trim();
  return "";
}

/** Strip theme combined forward-looking content when no pursuit in the theme has enough user context. */
export function gateThemeCombined(
  combined: string,
  pursuitSignals: PursuitSignal[],
): string {
  if (!combined.trim()) return "";
  if (pursuitSignals.some(hasMinimumContextSignal)) return combined.trim();
  return "";
}

/** Strip pursuit comparison benchmarks when the focal pursuit lacks enough user context. */
export function gatePursuitComparison(
  comparison: string,
  signal: PursuitSignal,
): string {
  if (!comparison.trim()) return "";
  if (hasMinimumContextSignal(signal)) return comparison.trim();
  return "";
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
