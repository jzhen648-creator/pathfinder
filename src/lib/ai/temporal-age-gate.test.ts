import { describe, expect, it } from "vitest";
import {
  collectChapterAgeFacts,
  gateMisappliedCurrentAgeProse,
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

const APPRENTICESHIP_FACT: ChapterAgeFact = {
  title: "Apprenticeship",
  themeId: "work",
  timelineStart: "2024-09-01",
  ageAtStart: 17,
};

describe("collectChapterAgeFacts", () => {
  it("computes age at start from timelineStart and DOB", () => {
    const facts = collectChapterAgeFacts(MAP_CONTEXT, DOB);
    expect(facts).toEqual([APPRENTICESHIP_FACT]);
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
