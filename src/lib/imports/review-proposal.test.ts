import { describe, expect, it } from "vitest";
import { reviewImportProposalSchema } from "./review-proposal";

describe("import proposal review schema", () => {
  it("accepts a staged selection without applying the proposal", () => {
    expect(reviewImportProposalSchema.safeParse({ action: "select" }).success).toBe(true);
  });
  it("accepts a corrected new chapter title and primary theme", () => {
    expect(
      reviewImportProposalSchema.safeParse({
        action: "set_new_chapter",
        title: "Return to London",
        primaryThemeId: "people",
      }).success,
    ).toBe(true);
    expect(
      reviewImportProposalSchema.safeParse({
        action: "set_new_chapter",
        title: "Return to London",
        primaryThemeId: "unknown-theme",
      }).success,
    ).toBe(false);
  });

  it("allows one edit to correct wording, date, and the chapter draft", () => {
    expect(
      reviewImportProposalSchema.safeParse({
        action: "edit",
        proposedText: "I will return to London on 16 August 2026.",
        effectiveFrom: "2026-08-16T00:00:00.000Z",
        newChapterDraft: { title: "Return to London", primaryThemeId: "people" },
      }).success,
    ).toBe(true);
  });
});
