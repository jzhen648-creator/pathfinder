import { ImportProposalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  LifeUpdateConfirmationConflictError,
  planLifeUpdateConfirmation,
} from "./confirm-life-update";

describe("Life Update confirmation plan", () => {
  it("requires every primary proposal to have a review decision", () => {
    expect(() =>
      planLifeUpdateConfirmation([
        {
          id: "unreviewed",
          status: ImportProposalStatus.PENDING,
          reviewBucket: "primary",
          reviewDecision: null,
        },
      ]),
    ).toThrow(LifeUpdateConfirmationConflictError);
  });

  it("applies selected primary and overflow proposals while allowing defer and dismiss", () => {
    expect(
      planLifeUpdateConfirmation([
        {
          id: "selected-primary",
          status: ImportProposalStatus.PENDING,
          reviewBucket: "primary",
          reviewDecision: "accept",
        },
        {
          id: "deferred-primary",
          status: ImportProposalStatus.DEFERRED,
          reviewBucket: "primary",
          reviewDecision: null,
        },
        {
          id: "selected-overflow",
          status: ImportProposalStatus.PENDING,
          reviewBucket: "overflow",
          reviewDecision: "accept",
        },
      ]),
    ).toMatchObject({
      selectedProposalIds: ["selected-primary", "selected-overflow"],
      hasPreviouslyApplied: false,
    });
  });
});
