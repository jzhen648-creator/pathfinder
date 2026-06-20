import { describe, expect, it } from "vitest";

import { resolvePursuitInsightTone } from "@/lib/insights/resolve-pursuit-insight-tone";
import { DENSE_FIXTURE_NOW } from "@/lib/map/__fixtures__/dense-map";

describe("apply-reflect-output", () => {
  it("deterministic tone overrides model celebratory on gap-shaped pursuit", () => {
    const tone = resolvePursuitInsightTone(
      {
        title: "CeMAP qualification",
        description: "",
        enrichAnswers: null,
        status: "ACTIVE",
        significance: 5,
        deadline: new Date("2026-06-20T00:00:00.000Z"),
        targetAmount: null,
        currentAmount: null,
        milestones: [
          { id: "m1", title: "Unit 1", completedAt: null },
          { id: "m2", title: "Unit 2", completedAt: null },
        ],
      },
      DENSE_FIXTURE_NOW,
    );
    expect(tone).toBe("worth_a_look");
  });
});
