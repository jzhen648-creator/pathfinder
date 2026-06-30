import { describe, expect, it } from "vitest";
import { updateGoalPayloadSchema } from "@/lib/validation/update-goal";

describe("updateGoalPayloadSchema timelineStart", () => {
  it("accepts null to clear start date", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ timelineStart: null });
    expect(parsed.success).toBe(true);
  });

  it("accepts a past calendar day", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ timelineStart: "2025-06-01" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a future start date", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ timelineStart: "2099-01-01" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("timelineStart"))).toBe(
        true,
      );
    }
  });
});

describe("updateGoalPayloadSchema rationale", () => {
  it("accepts null to clear rationale", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ rationale: null });
    expect(parsed.success).toBe(true);
  });

  it("accepts a string up to 1000 characters", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ rationale: "a".repeat(1000) });
    expect(parsed.success).toBe(true);
  });

  it("rejects a string over 1000 characters", () => {
    const parsed = updateGoalPayloadSchema.safeParse({ rationale: "a".repeat(1001) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("rationale"))).toBe(true);
    }
  });
});
