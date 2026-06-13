import { describe, expect, it } from "vitest";

import {
  normalizePursuitInsightTone,
  clampInsightGenerationJson,
} from "@/lib/insights/clamp-insight-json";

describe("clamp-insight-json", () => {
  it("normalizes pursuit insight tone drift", () => {
    expect(normalizePursuitInsightTone("reality check")).toBe("reality_check");
    expect(normalizePursuitInsightTone("one-off")).toBe("informational");
    expect(normalizePursuitInsightTone("encouraging")).toBe("encouraging");
  });

  it("clamps headline length on pursuit insight", () => {
    const clamped = clampInsightGenerationJson({
      pursuits: {
        g1: {
          insight: { tone: "Reality Check", headline: "x".repeat(120), body: "ok" },
        },
      },
    }) as { pursuits: { g1: { insight: { tone: string; headline: string } } } };

    expect(clamped.pursuits.g1.insight.tone).toBe("reality_check");
    expect(clamped.pursuits.g1.insight.headline.length).toBe(100);
  });
});
