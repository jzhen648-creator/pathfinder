import {
  ImportProposalStatus,
  LifeMemoryDestination,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  appendConfirmedContext,
  planContextProposalApplication,
} from "./apply-context-proposal";

const BASE = {
  status: ImportProposalStatus.PENDING,
  memoryDestination: LifeMemoryDestination.BACKGROUND,
  evidenceCount: 1,
  hasActiveChapterTarget: false,
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
      }),
    ).toEqual({ action: "update_chapter" });

    expect(() =>
      planContextProposalApplication({
        ...BASE,
        memoryDestination: LifeMemoryDestination.CHAPTER,
      }),
    ).toThrowError(expect.objectContaining({ code: "MISSING_TARGET" }));
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
});
