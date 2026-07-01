import { describe, expect, it } from "vitest";

import {
  normalizePursuitInsightTone,
  clampInsightGenerationJson,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/clamp-insight-json";

describe("clamp-insight-json", () => {
  it("normalizes pursuit insight tone drift to contract values", () => {
    expect(normalizePursuitInsightTone("reality check")).toBe("context");
    expect(normalizePursuitInsightTone("one-off")).toBe("context");
    expect(normalizePursuitInsightTone("encouraging")).toBe("in_focus");
    expect(normalizePursuitInsightTone("nudge")).toBe("worth_a_look");
    expect(normalizePursuitInsightTone("worth_a_look")).toBe("worth_a_look");
  });

  it("clamps headline on a word boundary with ellipsis when over budget", () => {
    const longHeadline =
      "Your qualifications are running ahead of the job search and that leverage shifts once you start negotiating offers with multiple employers";

    expect(longHeadline.length).toBeGreaterThan(PURSUIT_INSIGHT_HEADLINE_MAX);

    const clamped = clampInsightGenerationJson({
      pursuits: {
        g1: {
          insight: { tone: "Reality Check", headline: longHeadline, body: "ok" },
        },
      },
    }) as { pursuits: { g1: { insight: { tone: string; headline: string } } } };

    const headline = clamped.pursuits.g1.insight.headline;
    expect(clamped.pursuits.g1.insight.tone).toBe("context");
    expect(headline).toMatch(/…$/);
    expect(headline.length).toBeLessThanOrEqual(PURSUIT_INSIGHT_HEADLINE_MAX);

    const body = headline.slice(0, -1);
    expect(longHeadline.startsWith(body)).toBe(true);
    expect(longHeadline[body.length] === " " || longHeadline[body.length] === undefined).toBe(true);
  });

  it("does not cut mid-word like the sales-negotiator regression", () => {
    const longHeadline =
      "Commission structure matters more than base once you are negotiating and shifted into senior sales roles";

    const clamped = clampInsightGenerationJson({
      pursuits: {
        g1: { insight: { headline: longHeadline, body: "ok" } },
      },
    }) as { pursuits: { g1: { insight: { headline: string } } } };

    const headline = clamped.pursuits.g1.insight.headline;
    expect(headline).not.toMatch(/shifte$/);
    expect(headline).toMatch(/…$/);
  });
});
