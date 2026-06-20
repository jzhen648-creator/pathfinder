import { describe, expect, it } from "vitest";

import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";
import type { InsightCache } from "@/lib/insights/parse-insight-cache";

function baseRow(overrides: Partial<InsightCache>): InsightCache {
  return {
    id: "cache-1",
    userId: "user-1",
    globalInsight: "",
    themeInsights: {},
    categoryInsights: {},
    pursuitInsights: {},
    generatedAt: new Date("2026-06-01T00:00:00.000Z"),
    mapVersion: "abc",
    memoryVersion: 0,
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("insightCacheToPayload", () => {
  it("returns null when global and node caches are empty", () => {
    expect(insightCacheToPayload(baseRow({ globalInsight: "" }), false)).toBeNull();
  });

  it("serves theme/pursuit panels when global is invalid but node caches exist", () => {
    const payload = insightCacheToPayload(
      baseRow({
        globalInsight: "not-json",
        themeInsights: {
          work: {
            tone: "encouraging",
            oneLiner: "Work is active",
            reflective: "One pursuit in progress.",
            contextual: "",
            combined: "",
          },
        },
      }),
      false,
    );

    expect(payload?.themes.work?.oneLiner).toBe("Work is active");
    expect(payload?.global).toEqual({ greeting: "", sections: [] });
  });
});
