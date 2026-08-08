import {
  LifeBackgroundCategory,
  LifeMemoryDestination,
  LifeObservationKind,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildReviewContextPack } from "./review-context-pack";

describe("review context pack", () => {
  it("separates confirmed background, possibilities, and unresolved context", () => {
    const text = buildReviewContextPack({
      generatedAt: new Date("2026-08-02T00:00:00.000Z"),
      chapters: [
        {
          id: "career",
          title: "Mortgage adviser career",
          status: "ACTIVE",
          themeId: "work",
          background: "CeMAP completed.",
          currentFocus: "Secure a London role",
          timelineStart: null,
          deadline: null,
          observations: [],
        },
      ],
      observations: [
        {
          id: "identity",
          canonicalText: "British-Chinese, with life across three countries.",
          kind: LifeObservationKind.FACT,
          memoryDestination: LifeMemoryDestination.BACKGROUND,
          backgroundCategory: LifeBackgroundCategory.IDENTITY,
          temporalState: "ONGOING",
          effectiveFrom: null,
          effectiveTo: null,
          subjectLabel: null,
        },
        {
          id: "idea",
          canonicalText: "An EV9 tour business is being explored.",
          kind: LifeObservationKind.POSSIBILITY,
          memoryDestination: LifeMemoryDestination.POSSIBILITY,
          backgroundCategory: null,
          temporalState: "POSSIBLE",
          effectiveFrom: null,
          effectiveTo: null,
          subjectLabel: null,
        },
        {
          id: "question",
          canonicalText: "The housing sequence is unresolved.",
          kind: LifeObservationKind.OPEN_QUESTION,
          memoryDestination: LifeMemoryDestination.BACKGROUND,
          backgroundCategory: LifeBackgroundCategory.ASSETS_FINANCES,
          temporalState: "UNRESOLVED",
          effectiveFrom: null,
          effectiveTo: null,
          subjectLabel: null,
        },
      ],
    });

    expect(text).toContain("Mortgage adviser career");
    expect(text).toContain("British-Chinese, with life across three countries.");
    expect(text).toContain("## Possibilities—not commitments");
    expect(text).toContain("An EV9 tour business is being explored.");
    expect(text).toContain("## Unresolved or conflicting");
    expect(text).toContain("The housing sequence is unresolved.");
    expect(text).toContain("Do not invent facts.");
  });
});
