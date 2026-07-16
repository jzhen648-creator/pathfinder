import { describe, expect, it } from "vitest";

import { STATIC_INSIGHT_QUALITY_FIXTURES } from "@/lib/qa/insight-quality-fixtures";
import { gradeInsightQuality } from "@/lib/qa/insight-quality-grade";

describe("STATIC_INSIGHT_QUALITY_FIXTURES", () => {
  it("matches expectPass for every fixture (banned phrases are hard fails)", () => {
    for (const fixture of STATIC_INSIGHT_QUALITY_FIXTURES) {
      const flags = gradeInsightQuality(fixture.payload);
      const banned = flags.filter(
        (flag) =>
          flag.startsWith("banned-") ||
          flag.startsWith("status-narration-headline:"),
      );
      if (fixture.expectPass) {
        expect(banned, fixture.id).toEqual([]);
      } else {
        expect(banned.length, fixture.id).toBeGreaterThan(0);
      }
    }
  });
});
