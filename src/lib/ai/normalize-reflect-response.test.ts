import { describe, expect, it } from "vitest";

import {
  normalizeReflectResponse,
  THEME_ONE_LINER_MAX,
  truncateThemeOneLiner,
} from "@/lib/ai/normalize-reflect-response";
import { PURSUIT_INSIGHT_HEADLINE_MAX } from "@/lib/insights/clamp-insight-json";

describe("truncateThemeOneLiner", () => {
  it("returns short text unchanged", () => {
    expect(truncateThemeOneLiner("Work is the bottleneck this season.")).toBe(
      "Work is the bottleneck this season.",
    );
  });

  it("keeps a complete sentence within the 140-char budget without ellipsis", () => {
    const sentence =
      "Work is carrying the season with CeMAP study and mortgage broker job search both pressing against the same June deadline window.";
    expect(sentence.length).toBeLessThanOrEqual(THEME_ONE_LINER_MAX);
    expect(truncateThemeOneLiner(sentence)).toBe(sentence);
  });

  it("truncates on a word boundary with an ellipsis when over budget", () => {
    const long =
      "Work is carrying the season with CeMAP study and mortgage broker job search both pressing against the same June deadline window while Product Lead search and Senior Engineer handover all compete for attention in the same quarter";

    expect(long.length).toBeGreaterThan(THEME_ONE_LINER_MAX);
    const truncated = truncateThemeOneLiner(long);
    expect(truncated).toMatch(/…$/);
    expect(truncated.length).toBeLessThanOrEqual(THEME_ONE_LINER_MAX);

    const body = truncated.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length] === " " || long[body.length] === undefined).toBe(true);
  });
});

describe("normalizeReflectResponse", () => {
  it("applies word-boundary oneLiner truncation on theme entries", () => {
    const longOneLiner =
      "Work is carrying the season with CeMAP study and mortgage broker job search both pressing against the same June deadline window while Product Lead search and Senior Engineer handover all compete for attention in the same quarter";

    const normalized = normalizeReflectResponse({
      themes: {
        work: {
          tone: "encouraging",
          oneLiner: longOneLiner,
          reflective: "CeMAP and Mortgage broker job search both have June deadlines.",
        },
      },
      pursuits: {},
    }) as { themes: Record<string, { oneLiner: string }> };

    const oneLiner = normalized.themes.work.oneLiner;
    expect(oneLiner).toMatch(/…$/);
    expect(oneLiner.length).toBeLessThanOrEqual(THEME_ONE_LINER_MAX);

    const body = oneLiner.slice(0, -1);
    expect(longOneLiner.startsWith(body)).toBe(true);
    expect(longOneLiner[body.length] === " " || longOneLiner[body.length] === undefined).toBe(
      true,
    );
  });

  it("forces theme contextual and combined to empty strings", () => {
    const normalized = normalizeReflectResponse({
      themes: {
        work: {
          tone: "encouraging",
          oneLiner: "Work carries the season.",
          reflective: "CeMAP and broker search both press June.",
          contextual: "Mortgage advisers typically earn commission.",
          combined: "Across pursuits, work dominates.",
        },
      },
      pursuits: {},
    }) as { themes: Record<string, { contextual: string; combined: string }> };

    expect(normalized.themes.work.contextual).toBe("");
    expect(normalized.themes.work.combined).toBe("");
  });

  it("applies word-boundary headline truncation on pursuit entries", () => {
    const longHeadline =
      "Your qualifications are running ahead of the job search and that leverage shifts once you start negotiating offers with multiple employers";

    expect(longHeadline.length).toBeGreaterThan(PURSUIT_INSIGHT_HEADLINE_MAX);

    const normalized = normalizeReflectResponse({
      themes: {},
      pursuits: {
        g1: {
          insight: { headline: longHeadline, body: "Body text." },
        },
      },
    }) as { pursuits: Record<string, { headline: string }> };

    const headline = normalized.pursuits.g1.headline;
    expect(headline).toMatch(/…$/);
    expect(headline.length).toBeLessThanOrEqual(PURSUIT_INSIGHT_HEADLINE_MAX);

    const body = headline.slice(0, -1);
    expect(longHeadline.startsWith(body)).toBe(true);
    expect(longHeadline[body.length] === " " || longHeadline[body.length] === undefined).toBe(
      true,
    );
  });
});
