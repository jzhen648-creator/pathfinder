import { describe, expect, it } from "vitest";

import {
  computeGoalLifecycleStatus,
  goalAchievedForLifecycle,
} from "@/lib/goal-status-lifecycle";

describe("goalAchievedForLifecycle", () => {
  it("does not treat all milestones complete as pursuit completion for normal goals", () => {
    const achieved = goalAchievedForLifecycle(
      { goalType: "goal", future: false, year: null },
      [{ completedAt: new Date(), subtasks: [] }],
      2026,
    );
    expect(achieved).toBe(false);
  });

  it("still completes moment goals when all milestones are done", () => {
    const achieved = goalAchievedForLifecycle(
      { goalType: "moment", future: false, year: 2025 },
      [{ completedAt: new Date(), subtasks: [] }],
      2026,
    );
    expect(achieved).toBe(true);
  });

  it("completes moment goals by date when they have no milestones", () => {
    expect(
      goalAchievedForLifecycle({ goalType: "moment", future: false, year: 2025 }, [], 2026),
    ).toBe(true);
    expect(
      goalAchievedForLifecycle({ goalType: "moment", future: true, year: 2027 }, [], 2026),
    ).toBe(false);
  });
});

describe("computeGoalLifecycleStatus", () => {
  it("returns ACTIVE for normal pursuits regardless of milestone completion", () => {
    expect(
      computeGoalLifecycleStatus(
        { goalType: "goal", future: false, year: null },
        [{ completedAt: new Date(), subtasks: [] }],
        2026,
      ),
    ).toBe("ACTIVE");
  });
});
