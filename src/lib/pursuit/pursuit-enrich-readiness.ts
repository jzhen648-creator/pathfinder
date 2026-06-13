import type { PursuitEnrichResult } from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";

type PursuitSignal = {
  title: string;
  description: string;
  enrichAnswerCount: number;
  milestoneCount: number;
  hasDeadline: boolean;
  status: string;
};

export type { PursuitSignal };

/** Milestone suggestions only when enough structured signal exists. */
export function shouldSuggestMilestones(signal: PursuitSignal): boolean {
  if (signal.milestoneCount >= 3) return false;
  const contextChars =
    signal.description.trim().length + signal.enrichAnswerCount * 40;
  if (contextChars >= 80) return true;
  if (signal.enrichAnswerCount >= 2) return true;
  if (signal.hasDeadline && signal.title.trim().length >= 8) return true;
  return false;
}

export function gateEnrichResult(
  result: PursuitEnrichResult,
  signal: PursuitSignal,
  enrichOptions?: PursuitEnrichOptions,
): PursuitEnrichResult {
  const options = resolvePursuitEnrichOptions(enrichOptions);
  const clarifiers = !options.clarifyTitles
    ? []
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
