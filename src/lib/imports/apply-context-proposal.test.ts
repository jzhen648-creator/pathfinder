import {
  ImportProposalKind,
  ImportProposalStatus,
  LifeMemoryDestination,
  LifeObservationStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  appendConfirmedContext,
  planContextProposalApplication,
  replaceConfirmedContext,
} from "./apply-context-proposal";

const BASE = {
  status: ImportProposalStatus.PENDING,
  kind: ImportProposalKind.NEW_OBSERVATION,
  memoryDestination: LifeMemoryDestination.BACKGROUND,
  evidenceCount: 1,
  hasActiveChapterTarget: false,
  targetGoalId: null,
  targetObservation: null,
};

describe("context proposal application policy", () => {
  it("allows cited background without creating a chapter", () => {
    expect(planContextProposalApplication(BASE)).toEqual({ action: "create_background" });
  });

  it("requires an active existing chapter before revising it", () => {
    expect(
      planContextProposalApplication({
        ...BASE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
        hasActiveChapterTarget: true,
        targetGoalId: "chapter-1",
      }),
    ).toEqual({ action: "update_chapter" });

    expect(() =>
      planContextProposalApplication({
        ...BASE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
      }),
    ).toThrowError(expect.objectContaining({ code: "MISSING_TARGET" }));
  });

  it("only replaces an explicitly targeted active observation in the same chapter", () => {
    expect(
      planContextProposalApplication({
        ...BASE,
        kind: ImportProposalKind.UPDATE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
        hasActiveChapterTarget: true,
        targetGoalId: "chapter-1",
        targetObservation: {
          status: LifeObservationStatus.ACTIVE,
          memoryDestination: LifeMemoryDestination.CHAPTER,
          chapterIds: ["chapter-1"],
        },
      }),
    ).toEqual({ action: "update_chapter" });

    expect(() =>
      planContextProposalApplication({
        ...BASE,
        kind: ImportProposalKind.UPDATE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
        hasActiveChapterTarget: true,
        targetGoalId: "chapter-1",
        targetObservation: null,
      }),
    ).toThrowError(expect.objectContaining({ code: "MISSING_TARGET" }));

    expect(() =>
      planContextProposalApplication({
        ...BASE,
        kind: ImportProposalKind.UPDATE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
        hasActiveChapterTarget: true,
        targetGoalId: "chapter-1",
        targetObservation: {
          status: LifeObservationStatus.ACTIVE,
          memoryDestination: LifeMemoryDestination.CHAPTER,
          chapterIds: ["chapter-1", "chapter-2"],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_TARGET" }));
  });

  it.each([
    [{ ...BASE, evidenceCount: 0 }, "MISSING_EVIDENCE"],
    [{ ...BASE, memoryDestination: LifeMemoryDestination.SOURCE_ONLY }, "UNSUPPORTED_PROPOSAL"],
    [{ ...BASE, status: ImportProposalStatus.DISMISSED }, "DISMISSED_PROPOSAL"],
    [{ ...BASE, status: ImportProposalStatus.ACCEPTED }, "INCONSISTENT_APPLICATION"],
  ])("blocks unsafe or non-actionable input", (input, code) => {
    expect(() => planContextProposalApplication(input)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("appends confirmed wording once without duplicating it on retries", () => {
    expect(appendConfirmedContext(null, "Returning to London on 16 August 2026.")).toBe(
      "Returning to London on 16 August 2026.",
    );
    expect(
      appendConfirmedContext(
        "Career context.\n\nReturning to London on 16 August 2026.",
        "returning to london on 16 august 2026.",
      ),
    ).toBe("Career context.\n\nReturning to London on 16 August 2026.");
  });

  it("replaces only the exact prior paragraph and preserves unrelated context", () => {
    expect(
      replaceConfirmedContext(
        "Five years of property experience.\r\n\r\nSeeking a first mortgage adviser role.\r\n\r\nCeMAP completed.",
        "seeking a FIRST mortgage adviser role.",
        "Accepted a first mortgage adviser role; probation is now the immediate plan.",
      ),
    ).toBe(
      "Five years of property experience.\n\nAccepted a first mortgage adviser role; probation is now the immediate plan.\n\nCeMAP completed.",
    );

    expect(
      replaceConfirmedContext(
        "Five years of property experience.\n\nStill exploring adviser roles.",
        "Seeking a first mortgage adviser role.",
        "Accepted a first mortgage adviser role.",
      ),
    ).toBeNull();
  });
});
