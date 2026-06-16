import type { PursuitEnrichResult } from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";

/** Interim cap on milestones stored on the map — audit may raise/adjust. */
export const MILESTONE_MAP_CAP = 8;

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

export function hasMinimumContextSignal(signal: PursuitSignal): boolean {
  const contextChars =
    signal.description.trim().length + signal.enrichAnswerCount * 40;
  if (contextChars >= 80) return true;
  if (signal.enrichAnswerCount >= 2) return true;
  if (signal.hasDeadline && signal.title.trim().length >= 8) return true;
  return false;
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

/** Milestone suggestions when enough structured signal exists and path has room to grow. */
export function shouldSuggestMilestones(signal: PursuitSignal): boolean {
  if (signal.hasQuantifiedTarget) return false;
  if (signal.milestoneCount >= MILESTONE_MAP_CAP) return false;
  if (!hasMinimumContextSignal(signal)) return false;

  if (signal.milestoneCount === 0) return true;

  // Gap-fill while the path is unfinished, or extend when under cap.
  if (signal.completedMilestoneCount < signal.milestoneCount) return true;
  return signal.milestoneCount < MILESTONE_MAP_CAP;
}

export function gateEnrichResult(
  result: PursuitEnrichResult,
  signal: PursuitSignal,
  enrichOptions?: PursuitEnrichOptions,
): PursuitEnrichResult {
  const options = resolvePursuitEnrichOptions(enrichOptions);
  const clarifiers = !options.clarifyTitles
    ? []
    : signal.description.trim().length === 0
      ? result.clarifiers
      : signal.enrichAnswerCount >= 3 || signal.description.trim().length >= 120
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
