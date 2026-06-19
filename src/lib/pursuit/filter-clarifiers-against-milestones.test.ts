import { describe, expect, it } from "vitest";

import {
  filterClarifiersAgainstMilestones,
  optionContradictsCompletedMilestones,
  validateClarifierAnswerAgainstMilestones,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";

const completed5k = [{ title: "5k without stopping", completed: true }];

describe("optionContradictsCompletedMilestones", () => {
  it("flags Under 5k when a 5k milestone is complete", () => {
    expect(optionContradictsCompletedMilestones("Under 5k", completed5k)).toBe(true);
    expect(optionContradictsCompletedMilestones("under 5k", completed5k)).toBe(true);
    expect(optionContradictsCompletedMilestones("5-10k", completed5k)).toBe(false);
    expect(optionContradictsCompletedMilestones("10k+", completed5k)).toBe(false);
  });

  it("flags haven't started when any milestone is complete", () => {
    expect(optionContradictsCompletedMilestones("Haven't started training", completed5k)).toBe(
      true,
    );
  });
});

describe("filterClarifiersAgainstMilestones", () => {
  it("drops contradicting options and keeps clarifier when two valid options remain", () => {
    const clarifiers = [
      {
        id: "longest-run",
        prompt: "What's your current longest run?",
        options: ["Under 5k", "5-10k", "10k+"],
      },
    ];

    expect(filterClarifiersAgainstMilestones(clarifiers, completed5k)).toEqual([
      {
        id: "longest-run",
        prompt: "What's your current longest run?",
        options: ["5-10k", "10k+"],
      },
    ]);
  });

  it("drops whole clarifier when filtering leaves fewer than two options", () => {
    const clarifiers = [
      {
        id: "longest-run",
        prompt: "What's your current longest run?",
        options: ["Under 5k", "Haven't started training"],
      },
    ];

    expect(filterClarifiersAgainstMilestones(clarifiers, completed5k)).toEqual([]);
  });

  it("keeps clarifier when enough non-contradicting options remain", () => {
    const clarifiers = [
      {
        id: "10k-progress",
        prompt: "Where are you on the jump to 10k?",
        options: ["Still building toward 10k", "10k done", "Not sure yet"],
      },
    ];

    expect(filterClarifiersAgainstMilestones(clarifiers, completed5k)).toEqual(clarifiers);
  });
});

describe("validateClarifierAnswerAgainstMilestones", () => {
  it("rejects answers that contradict completed milestones", () => {
    expect(
      validateClarifierAnswerAgainstMilestones("Under 5k", completed5k),
    ).toMatch(/contradicts/);
    expect(validateClarifierAnswerAgainstMilestones("5-10k", completed5k)).toBeNull();
  });
});
