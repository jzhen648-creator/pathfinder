import { describe, expect, it } from "vitest";

import { serializeEnrichAnswersForMapContext, buildPursuitRow } from "@/lib/ai/format-map-context";

describe("serializeEnrichAnswersForMapContext", () => {
  it("returns structured enrichAnswers for map_context", () => {
    expect(
      serializeEnrichAnswersForMapContext([
        {
          clarifierId: "qq-1",
          prompt: "Stocks or cash ISA?",
          selectedOption: "Stocks and shares",
        },
      ]),
    ).toEqual([
      {
        clarifierId: "qq-1",
        prompt: "Stocks or cash ISA?",
        selectedOption: "Stocks and shares",
      },
    ]);
  });

  it("returns undefined for empty or invalid payloads", () => {
    expect(serializeEnrichAnswersForMapContext([])).toBeUndefined();
    expect(serializeEnrichAnswersForMapContext(null)).toBeUndefined();
    expect(serializeEnrichAnswersForMapContext({ bad: true })).toBeUndefined();
  });
});

describe("buildPursuitRow", () => {
  it("omits iconName and shortLabel from AI map_context rows", () => {
    const row = buildPursuitRow(
      {
        id: "g1",
        title: "Run 5k",
        description: "Training plan",
        status: "ACTIVE",
        significance: 3,
        parentGoalId: null,
        targetAmount: null,
        currentAmount: null,
        unit: null,
        deadline: null,
        completedAt: null,
        timelineStart: null,
        milestones: [],
      },
      new Map(),
    );

    expect(row).not.toHaveProperty("iconName");
    expect(row).not.toHaveProperty("shortLabel");
  });
});
