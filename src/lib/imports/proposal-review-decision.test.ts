import { describe, expect, it } from "vitest";
import {
  parseProposalReviewDecision,
  withProposalReviewDecision,
  withoutProposalReviewDecision,
} from "./proposal-review-decision";

describe("proposal review decision payload", () => {
  it("adds and removes a staged acceptance without losing processing metadata", () => {
    const selected = withProposalReviewDecision(
      { reviewBucket: "primary", processingKey: "segment-1" },
      "accept",
    );
    expect(parseProposalReviewDecision(selected)).toBe("accept");
    expect(selected).toMatchObject({ reviewBucket: "primary", processingKey: "segment-1" });

    const cleared = withoutProposalReviewDecision(selected);
    expect(parseProposalReviewDecision(cleared)).toBeNull();
    expect(cleared).toEqual({ reviewBucket: "primary", processingKey: "segment-1" });
  });
});
