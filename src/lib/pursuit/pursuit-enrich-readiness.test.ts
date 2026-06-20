import { describe, expect, it } from "vitest";

import {
  MILESTONE_MAP_CAP,
  gateEnrichResult,
  gatePursuitComparison,
  gateThemeCombined,
  gateThemeContextual,
  isHolisticBenchmarkEligible,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { buildStorySystemPrompt } from "@/lib/story/generate-story";

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

  it("allows sparse title-only pursuits without deadline or enrich context", () => {
    expect(
      shouldSuggestMilestones(
        signal({
          title: "Hi",
          hasDeadline: false,
          milestoneCount: 0,
        }),
      ),
    ).toBe(true);
  });
});

describe("gateThemeContextual", () => {
  it("keeps contextual when at least one pursuit in the theme has enough signal", () => {
    expect(
      gateThemeContextual("Typical at your age in London.", [
        signal({ title: "Hi", hasDeadline: false }),
        signal({ description: "Training three times a week for a spring half marathon." }),
      ]),
    ).toBe("Typical at your age in London.");
  });

  it("clears contextual when every pursuit in the theme is title-only thin", () => {
    expect(
      gateThemeContextual("Typical at your age in London.", [
        signal({ title: "Run", hasDeadline: false }),
        signal({ title: "Gym", hasDeadline: false }),
      ]),
    ).toBe("");
  });

  it("passes through empty contextual unchanged", () => {
    expect(gateThemeContextual("", [signal()])).toBe("");
  });
});

describe("gateThemeCombined", () => {
  it("keeps combined when at least one pursuit in the theme has enough signal", () => {
    expect(
      gateThemeCombined("CeMAP opens mortgage broker roles.", [
        signal({ title: "Hi", hasDeadline: false }),
        signal({ description: "Halfway through CeMAP units with a June exam date." }),
      ]),
    ).toBe("CeMAP opens mortgage broker roles.");
  });

  it("clears combined when every pursuit in the theme is title-only thin", () => {
    expect(
      gateThemeCombined("CeMAP opens mortgage broker roles.", [
        signal({ title: "Run", hasDeadline: false }),
        signal({ title: "Gym", hasDeadline: false }),
      ]),
    ).toBe("");
  });

  it("passes through empty combined unchanged", () => {
    expect(gateThemeCombined("", [signal()])).toBe("");
  });
});

describe("gatePursuitComparison", () => {
  it("keeps comparison when the pursuit has enough signal", () => {
    expect(
      gatePursuitComparison(
        "Typical London salary roughly £45–55k.",
        signal({ description: "Targeting a mortgage broker role after CeMAP." }),
      ),
    ).toBe("Typical London salary roughly £45–55k.");
  });

  it("clears comparison for a title-only thin pursuit", () => {
    expect(
      gatePursuitComparison(
        "Typical London salary roughly £45–55k.",
        signal({ title: "Job", hasDeadline: false }),
      ),
    ).toBe("");
  });
});

describe("isHolisticBenchmarkEligible", () => {
  it("requires at least two pursuits with minimum context signal", () => {
    expect(
      isHolisticBenchmarkEligible([
        signal({ title: "Run", hasDeadline: false }),
        signal({ description: "Training three times a week for a spring half marathon." }),
      ]),
    ).toBe(false);
    expect(
      isHolisticBenchmarkEligible([
        signal({ description: "Training three times a week for a spring half marathon." }),
        signal({ description: "Saving £500 a month toward a house deposit." }),
      ]),
    ).toBe(true);
  });
});

describe("buildStorySystemPrompt holistic benchmark gate", () => {
  const benchmarkMarker = "weave in one holistic benchmark";

  it("omits holistic benchmark clause on thin maps", () => {
    expect(buildStorySystemPrompt(5, false, false)).not.toContain(benchmarkMarker);
  });

  it("includes holistic benchmark clause when eligible", () => {
    expect(buildStorySystemPrompt(5, false, true)).toContain(benchmarkMarker);
  });
});

describe("buildStorySystemPrompt word count", () => {
  it("includes hard word-count constraints for seasonRead", () => {
    const prompt = buildStorySystemPrompt(3);
    expect(prompt).toContain("Your response MUST be 100–140 words. Never exceed 150 words.");
    expect(prompt).toContain("Do not write a closing paragraph of generic advice");
    expect(prompt).toContain(
      "Every sentence must be grounded in a specific, named pursuit and its status, or in a real relationship between pursuits or themes",
    );
    expect(prompt).toContain("At most ONE concrete suggestion in the entire reading");
  });
});

describe("buildStorySystemPrompt Phase 0/1 trust and layering", () => {
  it("disambiguates arrival from milestone progress and bans false completion", () => {
    const prompt = buildStorySystemPrompt(3);
    expect(prompt).toContain("NEVER describe an ACTIVE, PAUSED, or MAINTAINING pursuit as completed");
    expect(prompt).toContain("milestone_complete");
    expect(prompt).toContain("signal: arrival");
  });

  it("removes Gap lens and bans milestone/deadline audits in whole-map Reading", () => {
    const prompt = buildStorySystemPrompt(3);
    expect(prompt).not.toContain("- Gap:");
    expect(prompt).toContain("Do NOT audit milestones");
    expect(prompt).toContain("Ignore gapFacts, milestonePaceFacts");
  });

  it("adds cross-theme weight guidance only in PANORAMIC mode", () => {
    const panoramic = buildStorySystemPrompt(3);
    expect(panoramic).toContain("cross-theme weight");
    expect(panoramic).toContain("mapAggregates.highSignificanceActive");

    const sparse = buildStorySystemPrompt(2);
    expect(sparse).not.toContain("cross-theme weight");
    expect(sparse).not.toContain("mapAggregates.highSignificanceActive");
  });
});

describe("gateEnrichResult", () => {
  const sampleClarifiers = [
    {
      id: "ctx-1",
      prompt: "Where do you plan to get treatment?",
      options: ["UK", "Abroad", "Not sure yet"],
    },
  ];

  const sampleResult = {
    clarifiers: sampleClarifiers,
    insight: {
      tone: "context" as const,
      headline: "Needs treatment context",
      body: "Provider and country would sharpen this panel.",
    },
    suggestedMilestones: null,
  };

  it("strips all clarifiers when clarifyTitles is off", () => {
    const gated = gateEnrichResult(sampleResult, signal(), { clarifyTitles: false });
    expect(gated.clarifiers).toEqual([]);
  });

  it("strips clarifiers when PAUSED regardless of description richness", () => {
    const gated = gateEnrichResult(
      sampleResult,
      signal({
        description: "Training three times a week for a spring half marathon with a coach.",
        status: "PAUSED",
      }),
      { clarifyTitles: true },
      { status: "PAUSED" },
    );
    expect(gated.clarifiers).toEqual([]);
  });

  it("strips clarifiers during cooldown", () => {
    const gated = gateEnrichResult(
      sampleResult,
      signal(),
      { clarifyTitles: true },
      {
        status: "ACTIVE",
        quickQuestionsQuietUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
    );
    expect(gated.clarifiers).toEqual([]);
  });

  it("keeps clarifiers for rich pursuits — QQ stop is decoupled from hasMinimumContextSignal", () => {
    const gated = gateEnrichResult(
      sampleResult,
      signal({
        description: "Training three times a week for a spring half marathon with a coach.",
        enrichAnswerCount: 2,
      }),
      { clarifyTitles: true },
      { status: "ACTIVE" },
    );
    expect(gated.clarifiers).toHaveLength(1);
  });

  it("does not change milestone suggestions when clarifiers are kept", () => {
    const rich = signal({
      description: "Training three times a week for a spring half marathon with a coach.",
      enrichAnswerCount: 2,
    });
    const gated = gateEnrichResult(
      { ...sampleResult, suggestedMilestones: [{ title: "10k", order: 0 }] },
      rich,
      { clarifyTitles: true },
      { status: "ACTIVE" },
    );
    expect(gated.suggestedMilestones).toEqual([{ title: "10k", order: 0 }]);
  });
});
