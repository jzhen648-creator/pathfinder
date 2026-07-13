import { describe, expect, it } from "vitest";

import { validateMilestoneReorder } from "@/lib/reorder-goal-milestones";

describe("validateMilestoneReorder", () => {
  it("accepts a full permutation", () => {
    expect(validateMilestoneReorder(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("rejects missing ids", () => {
    expect(validateMilestoneReorder(["a", "b"], ["a"])).toBe(false);
  });

  it("rejects unknown ids", () => {
    expect(validateMilestoneReorder(["a", "b"], ["a", "x"])).toBe(false);
  });

  it("rejects duplicate ids in the proposed order", () => {
    expect(validateMilestoneReorder(["a", "b"], ["a", "a"])).toBe(false);
  });

  it("accepts empty lists", () => {
    expect(validateMilestoneReorder([], [])).toBe(true);
  });
});
