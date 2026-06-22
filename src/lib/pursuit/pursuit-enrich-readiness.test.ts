import { describe, expect, it } from "vitest";

import {
  gateEnrichResult,
  gateThemeCombined,
  gateThemeContextual,
  gateThemeContextualContent,
  gateThemeReflective,
  gatePursuitComparison,
  hasMinimumContextSignal,
  isHolisticBenchmarkEligible,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

const richSignal: PursuitSignal = {
  title: "Build £500k ISA",
  description: "Monthly contributions from salary",
  enrichAnswerCount: 2,
  milestoneCount: 2,
  completedMilestoneCount: 1,
  hasDeadline: true,
  hasQuantifiedTarget: true,
  status: "ACTIVE",
};

const thinSignal: PursuitSignal = {
  title: "Learn Spanish",
  description: "",
  enrichAnswerCount: 0,
  milestoneCount: 0,
  completedMilestoneCount: 0,
  hasDeadline: false,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
};

describe("pursuit-enrich-readiness gates", () => {
  it("gateThemeCombined strips when no confirmed links", () => {
    expect(gateThemeCombined("CeMAP feeds broker role.", false)).toBe("");
    expect(gateThemeCombined("CeMAP feeds broker role.", true)).toBe("CeMAP feeds broker role.");
  });

  it("gateThemeContextual respects benchmark applicability", () => {
    const text = "At 29, ISA contributions often sit below £20k annual limit.";
    expect(
      gateThemeContextual(text, [richSignal], {
        themeId: "finance",
        age: 29,
        location: "London",
        benchmarkApplicable: true,
      }),
    ).toBe(text);
    expect(
      gateThemeContextual(text, [richSignal], {
        themeId: "finance",
        age: 29,
        location: "London",
        benchmarkApplicable: false,
      }),
    ).toBe("");
  });

  it("gatePursuitComparison allows benchmarks with profile + milestones", () => {
    const comparison = "Typical half-marathon prep is 12-16 weeks from a 5k base.";
    const marathonSignal: PursuitSignal = {
      title: "Half marathon",
      description: "",
      enrichAnswerCount: 0,
      milestoneCount: 3,
      completedMilestoneCount: 1,
      hasDeadline: false,
      hasQuantifiedTarget: false,
      status: "ACTIVE",
    };
    expect(gatePursuitComparison(comparison, marathonSignal)).toBe("");
    expect(
      gatePursuitComparison(comparison, marathonSignal, { age: 29, location: "London" }),
    ).toBe(comparison);
  });

  it("isHolisticBenchmarkEligible when age and location are both known", () => {
    expect(isHolisticBenchmarkEligible([], { age: 29, location: "London" })).toBe(true);
  });

  it("hasMinimumContextSignal counts enrich answers", () => {
    expect(hasMinimumContextSignal(thinSignal)).toBe(false);
    expect(hasMinimumContextSignal(richSignal)).toBe(true);
  });

  it("gateEnrichResult keeps clarifiers for deadline+title pursuits (QQ decoupled from richness)", () => {
    const deadlineTitleSignal: PursuitSignal = {
      title: "Save for house deposit",
      description: "",
      enrichAnswerCount: 0,
      milestoneCount: 0,
      completedMilestoneCount: 0,
      hasDeadline: true,
      hasQuantifiedTarget: false,
      status: "ACTIVE",
    };
    expect(hasMinimumContextSignal(deadlineTitleSignal)).toBe(true);
    const gated = gateEnrichResult(
      {
        clarifiers: [{ id: "route", prompt: "What route?", options: ["A", "B"], kind: "clarify" }],
        insight: { tone: "context", headline: "Headline", body: "Body" },
        suggestedMilestones: null,
      },
      deadlineTitleSignal,
      { clarifyTitles: true },
    );
    expect(gated.clarifiers).toHaveLength(1);
  });

  it("gateThemeContextualContent strips editorial Comparison filler", () => {
    expect(
      gateThemeContextualContent(
        "For a 29-year-old in London, pursuing DipPFS is valued in a competitive market.",
      ),
    ).toBe("");
    expect(gateThemeContextualContent("Median ISA balance near £20k at age 29.")).toBe(
      "Median ISA balance near £20k at age 29.",
    );
  });

  it("gateThemeReflective strips confirmed link sentences", () => {
    const themeMap = new Map([
      ["p-cemap", "work"],
      ["p-broker", "work"],
    ]);
    const reflective =
      "CeMAP and Sales role are active. You linked CeMAP qualification to Independent broker via feeds into.";
    const stripped = gateThemeReflective(reflective, "work", [
      {
        goalAId: "p-cemap",
        goalBId: "p-broker",
        label: "feeds into",
        goalATitle: "CeMAP qualification",
        goalBTitle: "Independent broker",
      },
    ], themeMap);
    expect(stripped).toBe("CeMAP and Sales role are active.");
    expect(stripped.toLowerCase()).not.toContain("feeds into");
  });
});
