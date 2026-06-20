import { describe, expect, it } from "vitest";

import {
  buildPursuitCachePayload,
  clarifierPreserveAllowed,
  dedupeSuggestedMilestones,
  resolvePreservedClarifiers,
  resolvePreservedComparison,
  resolvePreservedInsightText,
  resolvePreservedThemeText,
  resolveReflectSuggestedMilestones,
} from "@/lib/pursuit/pursuit-cache-patch";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import { gateThemeContextual } from "@/lib/pursuit/pursuit-enrich-readiness";

const signal = (): PursuitSignal => ({
  title: "CeMAP qualification",
  description: "x".repeat(80),
  enrichAnswerCount: 2,
  milestoneCount: 0,
  completedMilestoneCount: 0,
  hasDeadline: true,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
});

describe("pursuit-cache-patch", () => {
  it("dedupeSuggestedMilestones strips duplicate titles", () => {
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

  it("resolvePreservedInsightText keeps cached fromMap when reflect omits it", () => {
    expect(resolvePreservedInsightText(undefined, "Typical broker salary in London")).toBe(
      "Typical broker salary in London",
    );
    expect(resolvePreservedInsightText("Fresh benchmark", "Old benchmark")).toBe("Fresh benchmark");
  });

  it("resolvePreservedComparison keeps cached comparison when reflect omits it", () => {
    const cached = "Most people in your cohort are applying by now.";
    expect(resolvePreservedComparison(undefined, cached, signal())).toBe(cached);
    expect(resolvePreservedComparison("Fresh comparison", cached, signal())).toBe("Fresh comparison");
  });

  it("resolvePreservedClarifiers keeps cached quick questions when reflect omits them", () => {
    const cached = [
      {
        id: "q-1",
        prompt: "What role type are you targeting?",
        options: ["Employed", "Independent"],
      },
    ];

    expect(
      resolvePreservedClarifiers({
        fresh: [],
        cached,
        preserveAllowed: true,
      }),
    ).toEqual(cached);
    expect(
      resolvePreservedClarifiers({
        fresh: [],
        cached,
        preserveAllowed: false,
      }),
    ).toEqual([]);
  });

  it("clarifierPreserveAllowed blocks preserve during quiet period", () => {
    expect(
      clarifierPreserveAllowed({
        clarifyTitles: true,
        status: "ACTIVE",
        quickQuestionsQuietUntil: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("resolvePreservedThemeText keeps cached contextual when reflect omits it", () => {
    const gate = (text: string) => gateThemeContextual(text, [signal()]);
    expect(resolvePreservedThemeText(undefined, "Theme benchmark line", gate)).toBe(
      "Theme benchmark line",
    );
    expect(resolvePreservedThemeText("Fresh contextual", "Old contextual", gate)).toBe(
      "Fresh contextual",
    );
  });

  it("buildPursuitCachePayload omits empty optional fields", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [],
      suggestedMilestones: null,
      insight: {
        tone: "in_focus",
        headline: "Headline",
        body: "Body",
        fromMap: "Benchmark",
      },
    });

    expect(payload).toMatchObject({
      headline: "Headline",
      fromMap: "Benchmark",
    });
    expect(payload?.clarifiers).toBeUndefined();
    expect(payload?.suggestedMilestones).toBeUndefined();
  });
});
