import { describe, expect, it } from "vitest";

import {
  normalizePursuitInsightTone,
  clampInsightGenerationJson,
} from "@/lib/insights/clamp-insight-json";

describe("clamp-insight-json", () => {
  it("normalizes pursuit insight tone drift to contract values", () => {
    expect(normalizePursuitInsightTone("reality check")).toBe("context");
    expect(normalizePursuitInsightTone("one-off")).toBe("context");
    expect(normalizePursuitInsightTone("encouraging")).toBe("in_focus");
    expect(normalizePursuitInsightTone("nudge")).toBe("worth_a_look");
    expect(normalizePursuitInsightTone("worth_a_look")).toBe("worth_a_look");
  });

  it("clamps headline length on pursuit insight", () => {
    const clamped = clampInsightGenerationJson({
      pursuits: {
        g1: {
          insight: { tone: "Reality Check", headline: "x".repeat(120), body: "ok" },
        },
      },
    }) as { pursuits: { g1: { insight: { tone: string; headline: string } } } };

    expect(clamped.pursuits.g1.insight.tone).toBe("context");
    expect(clamped.pursuits.g1.insight.headline.length).toBe(100);
  });
});
