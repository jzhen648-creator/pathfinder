import { describe, expect, it } from "vitest";

import {
  benchmarkFactsApplicable,
  buildBenchmarkFactsBlock,
  parseAgeFromUserContext,
  parseLocationFromUserContext,
} from "@/lib/insights/benchmark-facts";

describe("benchmark-facts", () => {
  it("parses age and location from user context", () => {
    const ctx = "Name: Alex\nAge: 29\nLocation: London, UK";
    expect(parseAgeFromUserContext(ctx)).toBe(29);
    expect(parseLocationFromUserContext(ctx)).toBe("London, UK");
  });

  it("builds finance benchmark block when age and quantified pursuit exist", () => {
    const block = buildBenchmarkFactsBlock({
      age: 29,
      location: "London",
      themeIds: ["finance"],
      pursuits: [
        {
          id: "p-isa",
          themeId: "finance",
          title: "Build £500k ISA",
          targetAmount: 500_000,
          currentAmount: 50_000,
          enrichAnswerCount: 0,
        },
      ],
    });
    expect(block).toContain("finance:");
    expect(block).toContain("userAge: 29");
  });

  it("returns null when no theme facts apply", () => {
    const block = buildBenchmarkFactsBlock({
      age: null,
      location: null,
      themeIds: ["finance"],
      pursuits: [
        {
          id: "p-vague",
          themeId: "finance",
          title: "Save more",
          enrichAnswerCount: 0,
        },
      ],
    });
    expect(block).toBeNull();
  });

  it("benchmarkFactsApplicable requires profile or quantified signal for finance", () => {
    const pursuits = [
      {
        id: "p-isa",
        themeId: "finance",
        title: "ISA",
        targetAmount: 100_000,
        enrichAnswerCount: 0,
        milestoneCount: 0,
        hasDeadline: true,
      },
    ];
    expect(benchmarkFactsApplicable("finance", pursuits, 29, "London")).toBe(true);
    expect(benchmarkFactsApplicable("finance", pursuits, null, null)).toBe(true);
    expect(
      benchmarkFactsApplicable(
        "finance",
        [{ id: "p", themeId: "finance", title: "Save", enrichAnswerCount: 0 }],
        null,
        null,
      ),
    ).toBe(false);
  });

  it("benchmarkFactsApplicable allows health theme with milestones and full profile", () => {
    const pursuits = [
      {
        id: "p-hm",
        themeId: "health",
        title: "Half marathon",
        enrichAnswerCount: 0,
        milestoneCount: 2,
        completedMilestoneCount: 1,
        hasDeadline: true,
      },
    ];
    expect(benchmarkFactsApplicable("health", pursuits, 29, "London")).toBe(true);
    expect(benchmarkFactsApplicable("health", pursuits, 29, null)).toBe(false);
  });
});
