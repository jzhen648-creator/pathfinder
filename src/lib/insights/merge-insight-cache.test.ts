import { describe, expect, it } from "vitest";

import { patchHasNodeInsightContent } from "@/lib/insights/merge-insight-cache";

describe("merge-insight-cache", () => {
  it("detects reflect patch with themes and pursuits", () => {
    expect(
      patchHasNodeInsightContent({
        themes: {
          work: {
            tone: "encouraging",
            oneLiner: "Work is live",
            reflective: "CeMAP is active.",
            contextual: "",
            combined: "",
          },
        },
        hubs: {},
        pursuits: {
          "p-1": {
            tone: "informational",
            headline: "Next step",
            body: "Comparison: typical at 34 in London.",
          },
        },
      }),
    ).toBe(true);
  });

  it("returns false for empty patch", () => {
    expect(patchHasNodeInsightContent({ themes: {}, hubs: {}, pursuits: {} })).toBe(false);
  });
});
