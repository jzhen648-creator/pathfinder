import { describe, expect, it } from "vitest";

import { dedupeSuggestedMilestones, resolveReflectSuggestedMilestones } from "@/lib/ai/apply-reflect-output";
import { resolvePursuitInsightTone } from "@/lib/insights/resolve-pursuit-insight-tone";
import { DENSE_FIXTURE_NOW } from "@/lib/map/__fixtures__/dense-map";

describe("apply-reflect-output", () => {
  it("milestone dedup guard strips duplicate titles", () => {
    const deduped = dedupeSuggestedMilestones([
      { title: "CeMAP Module 1" },
      { title: "cemap module 1" },
      { title: "CeMAP Module 2" },
    ]);

    expect(deduped).toEqual([{ title: "CeMAP Module 1" }, { title: "CeMAP Module 2" }]);
  });

  it("resolveReflectSuggestedMilestones keeps cached suggestions when reflect omits them", () => {
    const cached = [
      { title: "First application submitted", order: 0 },
      { title: "First interview scheduled", order: 1 },
    ];

    expect(
      resolveReflectSuggestedMilestones({
        fresh: null,
        cached,
        mapMilestones: [],
        allowed: true,
      }),
    ).toEqual(cached);
  });

  it("resolveReflectSuggestedMilestones prefers fresh suggestions over cache", () => {
    const fresh = [{ title: "Budget established", order: 0 }];
    const cached = [{ title: "Old cached step", order: 0 }];

    expect(
      resolveReflectSuggestedMilestones({
        fresh,
        cached,
        mapMilestones: [],
        allowed: true,
      }),
    ).toEqual(fresh);
  });

  it("resolveReflectSuggestedMilestones drops suggestions already on the map", () => {
    expect(
      resolveReflectSuggestedMilestones({
        fresh: null,
        cached: [
          { title: "CeMAP Module 1", order: 0 },
          { title: "CeMAP Module 2", order: 1 },
        ],
        mapMilestones: [{ title: "CeMAP Module 1" }],
        allowed: true,
      }),
    ).toEqual([{ title: "CeMAP Module 2", order: 1 }]);
  });

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
