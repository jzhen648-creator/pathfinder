import {
  ImportProposalKind,
  ImportProposalStatus,
  LifeMemoryDestination,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { planNewChapterProposalApplication } from "./apply-new-chapter-proposal";

const BASE = {
  status: ImportProposalStatus.PENDING,
  kind: ImportProposalKind.NEW_CHAPTER,
  memoryDestination: LifeMemoryDestination.CHAPTER,
  evidenceCount: 1,
  draft: { title: "Return to London", primaryThemeId: "people" as const },
  hasTargetChapter: false,
  hasRevertedApplication: false,
};

describe("new chapter proposal application policy", () => {
  it("creates a chapter for a complete reviewed draft", () => {
    expect(planNewChapterProposalApplication(BASE)).toEqual({
      action: "create_chapter",
      draft: BASE.draft,
    });
  });

  it("restores the same archived chapter after undo", () => {
    expect(
      planNewChapterProposalApplication({
        ...BASE,
        hasTargetChapter: true,
        hasRevertedApplication: true,
      }),
    ).toEqual({ action: "restore_chapter", draft: BASE.draft });
  });

  it.each([
    [{ ...BASE, draft: null }, "MISSING_CHAPTER_DRAFT"],
    [{ ...BASE, evidenceCount: 0 }, "MISSING_EVIDENCE"],
    [{ ...BASE, kind: ImportProposalKind.UPDATE }, "UNSUPPORTED_PROPOSAL"],
    [{ ...BASE, memoryDestination: LifeMemoryDestination.BACKGROUND }, "UNSUPPORTED_PROPOSAL"],
    [{ ...BASE, hasTargetChapter: true }, "INCONSISTENT_APPLICATION"],
    [{ ...BASE, status: ImportProposalStatus.DISMISSED }, "DISMISSED_PROPOSAL"],
  ])("blocks unsafe or inconsistent input", (input, code) => {
    expect(() => planNewChapterProposalApplication(input)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});
