import { describe, expect, it } from "vitest";

import {
  chapterTitleTokenSimilarity,
  shouldWarnChapterTitleRename,
} from "@/lib/pursuit/chapter-title-similarity";

describe("chapterTitleTokenSimilarity", () => {
  it("returns high similarity for refinements", () => {
    expect(chapterTitleTokenSimilarity("Save for a car", "Save for a used car")).toBeGreaterThan(
      0.5,
    );
  });

  it("returns low similarity for repurposes", () => {
    expect(chapterTitleTokenSimilarity("Save for a car", "Save for a house deposit")).toBeLessThan(
      0.35,
    );
  });
});

describe("shouldWarnChapterTitleRename", () => {
  it("warns when derived content exists and titles diverge", () => {
    expect(
      shouldWarnChapterTitleRename({
        previousTitle: "Save for a car",
        nextTitle: "Save for a house deposit",
        enrichAnswerCount: 1,
        milestoneCount: 0,
      }),
    ).toBe(true);
  });

  it("does not warn for typo-level edits", () => {
    expect(
      shouldWarnChapterTitleRename({
        previousTitle: "Half marathon training",
        nextTitle: "Half-marathon training",
        enrichAnswerCount: 2,
        milestoneCount: 3,
      }),
    ).toBe(false);
  });

  it("does not warn when there is no derived content", () => {
    expect(
      shouldWarnChapterTitleRename({
        previousTitle: "Save for a car",
        nextTitle: "Save for a house deposit",
        enrichAnswerCount: 0,
        milestoneCount: 0,
      }),
    ).toBe(false);
  });
});
