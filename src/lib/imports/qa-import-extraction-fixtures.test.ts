import { describe, expect, it } from "vitest";
import { segmentImportSource } from "./segmentation";
import { IMPORT_EXTRACTION_QA_FIXTURES } from "./qa-import-extraction-fixtures";

describe("real-provider import extraction QA fixtures", () => {
  it("uses unique fixture and expectation ids with valid existing targets", () => {
    expect(new Set(IMPORT_EXTRACTION_QA_FIXTURES.map((fixture) => fixture.id)).size).toBe(
      IMPORT_EXTRACTION_QA_FIXTURES.length,
    );

    for (const fixture of IMPORT_EXTRACTION_QA_FIXTURES) {
      const expectationIds = fixture.expectations.map((expectation) => expectation.id);
      expect(new Set(expectationIds).size).toBe(expectationIds.length);
      const goalIds = new Set(fixture.context.goals.map((goal) => goal.id));
      for (const expectation of fixture.expectations) {
        if (expectation.targetGoalId) expect(goalIds.has(expectation.targetGoalId)).toBe(true);
        for (const group of expectation.termGroups) {
          expect(group.some((term) => fixture.sourceText.toLocaleLowerCase().includes(term))).toBe(true);
        }
      }
    }
  });

  it("covers a single-segment Snapshot, conversation, and multi-segment summary", () => {
    const segmentCounts = Object.fromEntries(
      IMPORT_EXTRACTION_QA_FIXTURES.map((fixture) => [
        fixture.id,
        segmentImportSource(fixture.sourceText).length,
      ]),
    );
    expect(segmentCounts["structured-snapshot"]).toBe(1);
    expect(segmentCounts["ordinary-conversation"]).toBe(1);
    expect(segmentCounts["large-multi-chapter-summary"]).toBeGreaterThan(1);
  });
});
