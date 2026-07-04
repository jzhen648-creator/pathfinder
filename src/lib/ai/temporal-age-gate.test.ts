import { describe, expect, it } from "vitest";
import {
  collectChapterAgeFacts,
  formatChapterAgeFactsBlock,
  gateMisappliedCurrentAgeProse,
  isYearPrecisionOnly,
  type ChapterAgeFact,
} from "@/lib/ai/temporal-age-gate";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";

const DOB = new Date("2007-01-15T00:00:00.000Z");

const MAP_CONTEXT: FormattedMapContext = {
  themes: [
    {
      id: "work",
      label: "Work & Career",
      marks: [],
      categories: [
        {
          id: "cat-job",
          label: "Jobs & Roles",
          categoryLabel: "Jobs & Roles",
          marks: [],
          pursuits: [
            {
              id: "p1",
              title: "Apprenticeship",
              status: "ACTIVE",
              timelineStart: "2024-09-01",
              milestones: [],
            },
          ],
        },
      ],
    },
  ],
};

const CHRONOLOGY_MAP_CONTEXT: FormattedMapContext = {
  themes: [
    {
      id: "work",
      label: "Work & Career",
      marks: [],
      categories: [
        {
          id: "cat-job",
          label: "Jobs & Roles",
          categoryLabel: "Jobs & Roles",
          marks: [],
          pursuits: [
            {
              id: "p3",
              title: "First mortgage role",
              status: "COMPLETE",
              timelineStart: "2026-03-01",
              milestones: [],
            },
            {
              id: "p1",
              title: "Apprenticeship",
              status: "COMPLETE",
              timelineStart: "2024-09-01",
              milestones: [],
            },
            {
              id: "p2",
              title: "Level 3 course",
              status: "COMPLETE",
              timelineStart: "2024-11-01",
              milestones: [],
            },
          ],
        },
      ],
    },
  ],
};

const APPRENTICESHIP_FACT: ChapterAgeFact = {
  title: "Apprenticeship",
  themeId: "work",
  timelineStart: "2024-09-01",
  ageAtStart: 17,
};

describe("isYearPrecisionOnly", () => {
  it("flags Jan 1 year-only defaults", () => {
    expect(isYearPrecisionOnly("2024-01-01")).toBe(true);
    expect(isYearPrecisionOnly("2024-09-01")).toBe(false);
  });
});

describe("collectChapterAgeFacts", () => {
  it("computes age at start from timelineStart and DOB", () => {
    const facts = collectChapterAgeFacts(MAP_CONTEXT, DOB);
    expect(facts).toEqual([APPRENTICESHIP_FACT]);
  });

  it("returns facts sorted by timelineStart", () => {
    const facts = collectChapterAgeFacts(CHRONOLOGY_MAP_CONTEXT, DOB);
    expect(facts.map((f) => f.title)).toEqual([
      "Apprenticeship",
      "Level 3 course",
      "First mortgage role",
    ]);
  });
});

describe("formatChapterAgeFactsBlock", () => {
  it("emits chronological voicing hints", () => {
    const facts = collectChapterAgeFacts(CHRONOLOGY_MAP_CONTEXT, DOB);
    const block = formatChapterAgeFactsBlock(facts);
    expect(block).toContain("Chronology (ages are anchors");
    expect(block).toContain("Apprenticeship — age 17 (anchor)");
    expect(block).toContain("same age");
    expect(block).toContain("First mortgage role — age");
    expect(block).toContain("state the new age");
  });
});

describe("gateMisappliedCurrentAgeProse", () => {
  it("rewrites explicit starting-at-current-age to age at start", () => {
    const gated = gateMisappliedCurrentAgeProse(
      "Starting a Level 3 apprenticeship at 19, especially with a stated salary of £40,000, is a strong entry.",
      19,
      [APPRENTICESHIP_FACT],
    );
    expect(gated).toContain("Starting a Level 3 apprenticeship at 17");
    expect(gated).not.toContain(" at 19");
  });

  it("strips leading At-19 when sentence describes a past transition", () => {
    const gated = gateMisappliedCurrentAgeProse(
      "At 19, you've moved directly from formal education into a Level 3 apprenticeship, earning a salary while you learn.",
      19,
      [APPRENTICESHIP_FACT],
    );
    expect(gated).not.toMatch(/^At 19/i);
    expect(gated).toContain("apprenticeship");
  });

  it("is a no-op when age matches age at start", () => {
    const text = "Starting apprenticeship at 17 is early.";
    expect(gateMisappliedCurrentAgeProse(text, 19, [APPRENTICESHIP_FACT])).toBe(text);
  });
});
