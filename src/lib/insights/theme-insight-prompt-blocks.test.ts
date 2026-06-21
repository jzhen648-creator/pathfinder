import { describe, expect, it } from "vitest";

import {
  PURSUIT_COMPARISON_FIELD_JOBS,
  THEME_INSIGHT_FIELD_JOBS,
} from "@/lib/insights/theme-insight-prompt-blocks";

describe("theme-insight-prompt-blocks", () => {
  it("routes confirmed relationships to combined only", () => {
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("combined (UI: ACROSS PURSUITS");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("Do NOT cite confirmedRelationships");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("contextual (UI: COMPARISON");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("<benchmark_facts>");
  });

  it("defines pursuit comparison as population benchmarks", () => {
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("Population / typical-norm benchmark");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("<benchmark_facts>");
  });
});
