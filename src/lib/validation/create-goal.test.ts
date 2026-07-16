import { describe, expect, it } from "vitest";
import { createGoalPayloadSchema } from "@/lib/validation/create-goal";

const base = {
  title: "Lose 20kg",
  description: "",
  categoryId: "cat_training",
  goalType: "project" as const,
  deadline: "2027-02-10",
  hasMeasurableTarget: true,
  targetAmount: "20",
  currentAmount: "0",
  unit: "kg",
};

describe("createGoalPayloadSchema background + iconName", () => {
  it("accepts optional background on create", () => {
    const parsed = createGoalPayloadSchema.safeParse({
      ...base,
      background: "Training plan starts mid-August.",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.background).toBe("Training plan starts mid-August.");
    }
  });

  it("rejects background over 1000 chars", () => {
    const parsed = createGoalPayloadSchema.safeParse({
      ...base,
      background: "a".repeat(1001),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("background"))).toBe(
        true,
      );
    }
  });

  it("accepts optional iconName on create", () => {
    const parsed = createGoalPayloadSchema.safeParse({
      ...base,
      iconName: "dumbbell",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.iconName).toBe("dumbbell");
    }
  });

  it("rejects invalid iconName", () => {
    const parsed = createGoalPayloadSchema.safeParse({
      ...base,
      iconName: "Not A Slug!!!",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("iconName"))).toBe(true);
    }
  });
});
