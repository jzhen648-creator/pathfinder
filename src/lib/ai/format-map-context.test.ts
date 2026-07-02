import { describe, expect, it } from "vitest";
import { buildPursuitRow } from "@/lib/ai/format-map-context";

describe("buildPursuitRow timelineStart", () => {
  const baseGoal = {
    id: "g1",
    title: "Learn guitar",
    status: "ACTIVE",
    significance: 3,
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
    const row = buildPursuitRow(baseGoal);
    expect(row.timelineStart).toBe("2026-01-15");
  });

  it("prefers explicit timelineStart over createdAt", () => {
    const row = buildPursuitRow({
      ...baseGoal,
      timelineStart: new Date("2025-10-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    expect(row.timelineStart).toBe("2025-10-01");
  });
});

describe("buildPursuitRow background", () => {
  const baseGoal = {
    id: "g1",
    title: "Learn guitar",
    status: "ACTIVE",
    significance: 3,
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

  it("emits background when non-empty", () => {
    const row = buildPursuitRow({
      ...baseGoal,
      background: "I want to play at family gatherings.",
    });
    expect(row.background).toBe("I want to play at family gatherings.");
  });

  it("omits background when null", () => {
    const row = buildPursuitRow({ ...baseGoal, background: null });
    expect(row.background).toBeUndefined();
  });

  it("omits background when empty string", () => {
    const row = buildPursuitRow({ ...baseGoal, background: "" });
    expect(row.background).toBeUndefined();
  });

  it("omits background when whitespace-only", () => {
    const row = buildPursuitRow({ ...baseGoal, background: "   " });
    expect(row.background).toBeUndefined();
  });
});
