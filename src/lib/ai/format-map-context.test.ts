import { describe, expect, it } from "vitest";

import {
  MAX_MILESTONE_DESCRIPTION_CHARS,
  serializeEnrichAnswersForMapContext,
  buildPursuitRow,
} from "@/lib/ai/format-map-context";

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

  it("includes milestone description when present", () => {
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
        milestones: [
          {
            id: "m1",
            title: "Complete couch to 5k week 4",
            completedAt: null,
            description: "Run 20 minutes without stopping",
          },
        ],
      },
      new Map(),
    );

    expect(row.milestones[0]?.description).toBe("Run 20 minutes without stopping");
  });

  it("caps long milestone descriptions", () => {
    const longDescription = "x".repeat(MAX_MILESTONE_DESCRIPTION_CHARS + 40);
    const row = buildPursuitRow(
      {
        id: "g1",
        title: "Run 5k",
        description: null,
        status: "ACTIVE",
        significance: 3,
        parentGoalId: null,
        targetAmount: null,
        currentAmount: null,
        unit: null,
        deadline: null,
        completedAt: null,
        timelineStart: null,
        milestones: [
          {
            id: "m1",
            title: "Long detail milestone",
            completedAt: null,
            description: longDescription,
          },
        ],
      },
      new Map(),
    );

    expect(row.milestones[0]?.description).toMatch(/…$/);
    expect(row.milestones[0]?.description?.length).toBeLessThanOrEqual(
      MAX_MILESTONE_DESCRIPTION_CHARS + 1,
    );
  });

  it("omits empty milestone descriptions", () => {
    const row = buildPursuitRow(
      {
        id: "g1",
        title: "Run 5k",
        description: null,
        status: "ACTIVE",
        significance: 3,
        parentGoalId: null,
        targetAmount: null,
        currentAmount: null,
        unit: null,
        deadline: null,
        completedAt: null,
        timelineStart: null,
        milestones: [{ id: "m1", title: "Week 1", completedAt: null, description: "   " }],
      },
      new Map(),
    );

    expect(row.milestones[0]).not.toHaveProperty("description");
  });

  it("includes daysUntilDeadline when a deadline is set", () => {
    const now = Date.parse("2026-06-21T12:00:00.000Z");
    const row = buildPursuitRow(
      {
        id: "g1",
        title: "London Marathon",
        description: "Training plan",
        status: "ACTIVE",
        significance: 4,
        parentGoalId: null,
        targetAmount: null,
        currentAmount: null,
        unit: null,
        deadline: new Date("2027-04-26T00:00:00.000Z"),
        completedAt: null,
        timelineStart: null,
        milestones: [],
      },
      new Map(),
      now,
    );

    expect(row.deadline).toBe("2027-04-26");
    expect(row.daysUntilDeadline).toBeGreaterThan(250);
    expect(row.daysUntilDeadline).toBeLessThan(400);
  });
});
