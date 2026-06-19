import type { Clarifier } from "@/lib/pursuit/pursuit-enrich-types";

export type MilestoneGroundingInput = {
  title: string;
  completed: boolean;
};

/** Extract distance tokens like 5k, 10km from milestone titles. */
export function extractDistanceTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/\b(\d+)\s*(k|km)\b/gi)) {
    tokens.add(`${match[1]}k`.toLowerCase());
  }
  return [...tokens];
}

/**
 * True when an MC option contradicts a completed milestone (conservative heuristic).
 * Covers "Under 5k" when a 5k milestone is done, and "Haven't started" when any milestone is complete.
 */
export function optionContradictsCompletedMilestones(
  option: string,
  completedMilestones: MilestoneGroundingInput[],
): boolean {
  const completed = completedMilestones.filter((m) => m.completed && m.title.trim());
  if (completed.length === 0) return false;

  const opt = option.trim().toLowerCase();
  if (
    /\bhaven'?t started\b|\bnot started\b|\bno training\b|\bnot training yet\b/.test(opt)
  ) {
    return true;
  }

  for (const milestone of completed) {
    for (const token of extractDistanceTokens(milestone.title)) {
      const num = token.replace(/k$/, "");
      if (
        new RegExp(`\\b(under|below|less than)\\s*${num}\\s*k\\b`, "i").test(option) ||
        opt === `under ${num}k` ||
        opt.startsWith(`under ${num}k `) ||
        opt.startsWith(`under ${num}k,`)
      ) {
        return true;
      }
    }
  }

  return false;
}

export function filterClarifiersAgainstMilestones(
  clarifiers: Clarifier[],
  milestones: MilestoneGroundingInput[],
): Clarifier[] {
  const completed = milestones.filter((m) => m.completed);
  if (completed.length === 0) return clarifiers;

  const filtered: Clarifier[] = [];
  for (const clarifier of clarifiers) {
    const options = clarifier.options.filter(
      (option) => !optionContradictsCompletedMilestones(option, completed),
    );
    if (options.length >= 2) {
      filtered.push({ ...clarifier, options });
    }
  }
  return filtered;
}

export function milestonesToGroundingInput(
  milestones: Array<{ title: string; completedAt?: Date | null; completed?: boolean }>,
): MilestoneGroundingInput[] {
  return milestones.map((m) => ({
    title: m.title,
    completed: m.completed === true || m.completedAt != null,
  }));
}

export function validateClarifierAnswerAgainstMilestones(
  selectedOption: string,
  milestones: MilestoneGroundingInput[],
): string | null {
  const completed = milestones.filter((m) => m.completed);
  if (completed.length === 0) return null;
  if (optionContradictsCompletedMilestones(selectedOption, completed)) {
    return "That answer contradicts a milestone you've already completed on this pursuit.";
  }
  return null;
}
