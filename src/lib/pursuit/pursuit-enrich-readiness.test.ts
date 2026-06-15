import { describe, expect, it } from "vitest";

import {
  MILESTONE_MAP_CAP,
  gateEnrichResult,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

function signal(overrides: Partial<PursuitSignal> = {}): PursuitSignal {
  return {
    title: "London Marathon 2027",
    description: "",
    enrichAnswerCount: 0,
    milestoneCount: 0,
    completedMilestoneCount: 0,
    hasDeadline: true,
    hasQuantifiedTarget: false,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("shouldSuggestMilestones", () => {
  it("allows deadline-led pursuits with no milestones", () => {
    expect(shouldSuggestMilestones(signal())).toBe(true);
  });

  it("blocks quantified amount pursuits", () => {
    expect(shouldSuggestMilestones(signal({ hasQuantifiedTarget: true }))).toBe(false);
  });

  it("blocks when map already has the interim cap", () => {
    expect(
      shouldSuggestMilestones(
        signal({ milestoneCount: MILESTONE_MAP_CAP, completedMilestoneCount: 2 }),
      ),
    ).toBe(false);
  });

  it("allows gap-fill when three shallow milestones exist but none completed", () => {
    expect(
      shouldSuggestMilestones(
        signal({
          milestoneCount: 3,
          completedMilestoneCount: 0,
          enrichAnswerCount: 2,
        }),
      ),
    ).toBe(true);
  });

  it("allows gap-fill when some milestones remain incomplete", () => {
    expect(
      shouldSuggestMilestones(
        signal({
          milestoneCount: 5,
          completedMilestoneCount: 2,
          enrichAnswerCount: 2,
        }),
      ),
    ).toBe(true);
  });

  it("blocks sparse pursuits without deadline or enrich context", () => {
    expect(
      shouldSuggestMilestones(
        signal({
          title: "Hi",
          hasDeadline: false,
          milestoneCount: 0,
        }),
      ),
    ).toBe(false);
  });
});

describe("gateEnrichResult", () => {
  it("allows clarifiers when description cleared but enrichAnswers remain", () => {
    const signal: PursuitSignal = {
      title: "Invisalign",
      description: "",
      enrichAnswerCount: 3,
      milestoneCount: 0,
      completedMilestoneCount: 0,
      hasDeadline: true,
      hasQuantifiedTarget: false,
      status: "ACTIVE",
    };
    const gated = gateEnrichResult(
      {
        clarifiers: [
          {
            id: "ctx-1",
            prompt: "Where do you plan to get treatment?",
            options: ["UK", "Abroad", "Not sure yet"],
          },
        ],
        insight: {
          tone: "informational",
          headline: "Invisalign needs treatment context",
          body: "Provider and country would sharpen this panel.",
        },
        suggestedMilestones: null,
      },
      signal,
      { clarifyTitles: true },
    );

    expect(gated.clarifiers).toHaveLength(1);
  });
});
