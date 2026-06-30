import { describe, expect, it } from "vitest";
import { buildPursuitRow } from "@/lib/ai/format-map-context";

describe("buildPursuitRow timelineStart", () => {
  const baseGoal = {
    id: "g1",
    title: "Learn guitar",
    description: "",
    status: "ACTIVE",
    significance: 3,
    parentGoalId: null,
    targetAmount: null,
    currentAmount: null,
    unit: null,
    amountBasis: null,
    deadline: null,
    completedAt: null,
    timelineStart: null,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    milestones: [{ id: "m1", title: "Buy strings", completedAt: null }],
  };

  it("falls back to createdAt when timelineStart is null", () => {
    const row = buildPursuitRow(baseGoal, new Map());
    expect(row.timelineStart).toBe("2026-01-15");
  });

  it("prefers explicit timelineStart over createdAt", () => {
    const row = buildPursuitRow(
      {
        ...baseGoal,
        timelineStart: new Date("2025-10-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-15T10:00:00.000Z"),
      },
      new Map(),
    );
    expect(row.timelineStart).toBe("2025-10-01");
  });
});

describe("buildPursuitRow rationale", () => {
  const baseGoal = {
    id: "g1",
    title: "Learn guitar",
    description: "",
    status: "ACTIVE",
    significance: 3,
    parentGoalId: null,
    targetAmount: null,
    currentAmount: null,
    unit: null,
    amountBasis: null,
    deadline: null,
    completedAt: null,
    timelineStart: null,
    createdAt: new Date("2026-01-15T10:00:00.000Z"),
    milestones: [],
  };

  it("emits rationale when non-empty", () => {
    const row = buildPursuitRow(
      { ...baseGoal, rationale: "I want to play at family gatherings." },
      new Map(),
    );
    expect(row.rationale).toBe("I want to play at family gatherings.");
  });

  it("omits rationale when null", () => {
    const row = buildPursuitRow({ ...baseGoal, rationale: null }, new Map());
    expect(row.rationale).toBeUndefined();
  });

  it("omits rationale when empty string", () => {
    const row = buildPursuitRow({ ...baseGoal, rationale: "" }, new Map());
    expect(row.rationale).toBeUndefined();
  });

  it("omits rationale when whitespace-only", () => {
    const row = buildPursuitRow({ ...baseGoal, rationale: "   " }, new Map());
    expect(row.rationale).toBeUndefined();
  });
});
