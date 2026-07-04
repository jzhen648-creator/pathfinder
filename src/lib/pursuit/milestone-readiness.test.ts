import { describe, expect, it } from "vitest";

import { computeMilestoneReadiness } from "@/lib/pursuit/milestone-readiness";
import { MILESTONE_READINESS_FIXTURES } from "@/lib/pursuit/milestone-readiness-fixtures";
import {
  MILESTONE_MAP_CAP,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

function readySignal(overrides: Partial<PursuitSignal> = {}): PursuitSignal {
  return {
    title: "Level 3 CeMAP apprenticeship at Kaplan",
    background: "Financial services route at Kaplan college, exam sittings in London.",
    backgroundChars: 70,
    enrichAnswerCount: 1,
    milestoneCount: 0,
    completedMilestoneCount: 0,
    hasDeadline: true,
    hasQuantifiedTarget: false,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("computeMilestoneReadiness", () => {
  it.each(MILESTONE_READINESS_FIXTURES)("$label -> ready=$expectedReady", ({ input, expectedReady }) => {
    expect(computeMilestoneReadiness(input).ready).toBe(expectedReady);
  });

  it("rejects long filler even when background is lengthy", () => {
    const readiness = computeMilestoneReadiness({
      title: "Apprenticeship",
      background:
        "i really want to do this it will be good and fun for my career development goals and i am excited about it all",
      enrichAnswerCount: 0,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain("specifics");
  });

  it("passes with one answered question and modest specific note", () => {
    const readiness = computeMilestoneReadiness({
      title: "Level 3 apprenticeship",
      background: "Kaplan college, CeMAP route.",
      enrichAnswerCount: 1,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
  });
});

describe("shouldSuggestMilestones readiness gate", () => {
  it("blocks suggestions on thin chapters with zero milestones", () => {
    expect(
      shouldSuggestMilestones(
        readySignal({
          title: "Apprenticeship",
          background: null,
          backgroundChars: 0,
          enrichAnswerCount: 0,
        }),
      ),
    ).toBe(false);
  });

  it("allows suggestions when chapter is ready and path is empty", () => {
    expect(shouldSuggestMilestones(readySignal())).toBe(true);
  });

  it("allows gap-fill once at least one milestone exists even if context thins", () => {
    expect(
      shouldSuggestMilestones(
        readySignal({
          title: "Apprenticeship",
          background: null,
          backgroundChars: 0,
          enrichAnswerCount: 0,
          milestoneCount: 2,
          completedMilestoneCount: 1,
        }),
      ),
    ).toBe(true);
  });

  it("still blocks quantified targets and cap", () => {
    expect(shouldSuggestMilestones(readySignal({ hasQuantifiedTarget: true }))).toBe(false);
    expect(
      shouldSuggestMilestones(
        readySignal({ milestoneCount: MILESTONE_MAP_CAP, completedMilestoneCount: MILESTONE_MAP_CAP }),
      ),
    ).toBe(false);
  });
});
