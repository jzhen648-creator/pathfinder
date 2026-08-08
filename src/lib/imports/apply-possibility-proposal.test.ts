import {
  ImportProposalKind,
  ImportProposalStatus,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeObservationStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ImportProposalApplicationConflictError,
  planPossibilityProposalApplication,
} from "./apply-possibility-proposal";

const BASE = {
  status: ImportProposalStatus.PENDING,
  kind: ImportProposalKind.NEW_OBSERVATION,
  informationType: LifeObservationKind.POSSIBILITY,
  memoryDestination: LifeMemoryDestination.POSSIBILITY,
  canonicalKey: "business:ev9-private-tours",
  evidenceCount: 1,
  target: null,
};

describe("possibility proposal application policy", () => {
  it("allows an evidenced idea to become a possibility without a chapter", () => {
    expect(planPossibilityProposalApplication(BASE)).toEqual({
      action: "create_possibility",
    });
  });

  it("allows an explicit decision to close an active possibility", () => {
    expect(
      planPossibilityProposalApplication({
        ...BASE,
        kind: ImportProposalKind.UPDATE,
        informationType: LifeObservationKind.DECISION,
        target: {
          status: LifeObservationStatus.ACTIVE,
          memoryDestination: LifeMemoryDestination.POSSIBILITY,
        },
      }),
    ).toEqual({ action: "close_possibility" });
  });

  it.each([
    ["a chapter mutation", { ...BASE, memoryDestination: LifeMemoryDestination.CHAPTER }, "UNSUPPORTED_PROPOSAL"],
    ["missing evidence", { ...BASE, evidenceCount: 0 }, "MISSING_EVIDENCE"],
    ["missing stable meaning", { ...BASE, canonicalKey: null }, "MISSING_CANONICAL_KEY"],
    [
      "an accepted proposal without an application record",
      { ...BASE, status: ImportProposalStatus.ACCEPTED },
      "INCONSISTENT_APPLICATION",
    ],
    [
      "a stale target",
      {
        ...BASE,
        kind: ImportProposalKind.UPDATE,
        informationType: LifeObservationKind.DECISION,
        target: {
          status: LifeObservationStatus.RESOLVED,
          memoryDestination: LifeMemoryDestination.POSSIBILITY,
        },
      },
      "STALE_TARGET",
    ],
  ])("blocks %s", (_label, input, expectedCode) => {
    expect(() => planPossibilityProposalApplication(input)).toThrowError(
      expect.objectContaining<Partial<ImportProposalApplicationConflictError>>({
        code: expectedCode as ImportProposalApplicationConflictError["code"],
      }),
    );
  });
});
