import { describe, expect, it } from "vitest";

import {
  buildEducationMilestoneRows,
  completedEducationMilestonePositions,
  ONBOARDING_EDUCATION_MILESTONES,
} from "@/lib/onboarding/education-pursuit-spec";

describe("education pursuit spec", () => {
  it("marks milestone progress by education level", () => {
    expect([...completedEducationMilestonePositions("secondary")]).toEqual([1, 2]);
    expect([...completedEducationMilestonePositions("further")]).toEqual([1, 2, 3]);
    expect([...completedEducationMilestonePositions("higher")]).toEqual([1, 2, 3, 4]);
  });

  it("builds four milestone rows with completedAt only through the user's level", () => {
    const completedAt = new Date("2020-06-01T00:00:00.000Z");
    const rows = buildEducationMilestoneRows("further", completedAt);
    expect(rows).toHaveLength(ONBOARDING_EDUCATION_MILESTONES.length);
    expect(rows.filter((row) => row.completedAt != null)).toHaveLength(3);
    expect(rows[3]?.completedAt).toBeNull();
  });
});

describe("ensureEducationPursuit idempotency key", () => {
  it("uses a stable title for lookup", async () => {
    const { ONBOARDING_EDUCATION_PURSUIT_TITLE } = await import(
      "@/lib/onboarding/education-pursuit-spec"
    );
    expect(ONBOARDING_EDUCATION_PURSUIT_TITLE).toBe("Finished formal education");
  });
});
