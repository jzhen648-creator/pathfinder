import { describe, expect, it } from "vitest";

import {
  PURSUIT_COMPARISON_FIELD_JOBS,
  THEME_INSIGHT_FIELD_JOBS,
} from "@/lib/insights/theme-insight-prompt-blocks";

describe("theme-insight-prompt-blocks", () => {
  it("describes theme card as oneLiner + reflective only", () => {
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("{ tone, oneLiner, reflective }");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("FROM YOUR MAP");
    expect(THEME_INSIGHT_FIELD_JOBS).not.toContain("ACROSS PURSUITS");
    expect(THEME_INSIGHT_FIELD_JOBS).not.toContain("COMPARISON");
  });

  it("defines pursuit comparison as population benchmarks", () => {
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("Population / typical-norm benchmark");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("<benchmark_facts>");
  });
});
