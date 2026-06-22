import { describe, expect, it } from "vitest";

import {
  normalizeReflectResponse,
  truncateThemeOneLiner,
} from "@/lib/ai/normalize-reflect-response";

describe("truncateThemeOneLiner", () => {
  it("returns short text unchanged", () => {
    expect(truncateThemeOneLiner("Work is the bottleneck this season.")).toBe(
      "Work is the bottleneck this season.",
    );
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const long =
      "Work is carrying the season with CeMAP study and mortgage broker job search both pressing against the same June deadline window";

    const truncated = truncateThemeOneLiner(long);
    expect(truncated).toMatch(/…$/);
    expect(truncated.length).toBeLessThanOrEqual(100);

    const body = truncated.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length] === " " || long[body.length] === undefined).toBe(true);
  });
});

describe("normalizeReflectResponse", () => {
  it("applies word-boundary oneLiner truncation on theme entries", () => {
    const longOneLiner =
      "Work is carrying the season with CeMAP study and mortgage broker job search both pressing against the same June deadline window";

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
    expect(oneLiner.length).toBeLessThanOrEqual(100);

    const body = oneLiner.slice(0, -1);
    expect(longOneLiner.startsWith(body)).toBe(true);
    expect(longOneLiner[body.length] === " " || longOneLiner[body.length] === undefined).toBe(
      true,
    );
  });
});
