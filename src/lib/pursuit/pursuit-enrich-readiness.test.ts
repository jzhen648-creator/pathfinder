import { describe, expect, it } from "vitest";

import {
  gateThemeCombined,
  gateThemeContextual,
  gatePursuitComparison,
  hasMinimumContextSignal,
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

  it("gatePursuitComparison requires minimum context on focal pursuit", () => {
    const comparison = "Typical ISA balance at 29 is lower than your target.";
    expect(gatePursuitComparison(comparison, richSignal)).toBe(comparison);
    expect(gatePursuitComparison(comparison, thinSignal)).toBe("");
  });

  it("hasMinimumContextSignal counts enrich answers", () => {
    expect(hasMinimumContextSignal(thinSignal)).toBe(false);
    expect(hasMinimumContextSignal(richSignal)).toBe(true);
  });
});
