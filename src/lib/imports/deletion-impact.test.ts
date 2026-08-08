import { describe, expect, it } from "vitest";
import { planHardSourceDeletion } from "./deletion-impact";

describe("source deletion impact", () => {
  it("distinguishes lost provenance from orphaned derived records", () => {
    const impact = planHardSourceDeletion({
      sourceId: "source-a",
      proposals: [
        { id: "pending", sourceId: "source-a", status: "PENDING" },
        { id: "accepted", sourceId: "source-a", status: "ACCEPTED" },
        { id: "other", sourceId: "source-b", status: "PENDING" },
      ],
      observationEvidence: [
        { sourceId: "source-a", derivedId: "observation-shared" },
        { sourceId: "source-b", derivedId: "observation-shared" },
        { sourceId: "source-a", derivedId: "observation-orphaned" },
      ],
      revisionEvidence: [
        { sourceId: "source-a", derivedId: "revision-orphaned" },
        { sourceId: "source-a", derivedId: "revision-shared" },
        { sourceId: "source-c", derivedId: "revision-shared" },
      ],
    });

    expect(impact).toEqual({
      proposalIdsRemoved: ["accepted", "pending"],
      acceptedProposalIdsLosingSourceRecord: ["accepted"],
      observationIdsLosingEvidence: ["observation-orphaned", "observation-shared"],
      observationIdsOrphaned: ["observation-orphaned"],
      revisionIdsLosingEvidence: ["revision-orphaned", "revision-shared"],
      revisionIdsOrphaned: ["revision-orphaned"],
    });
  });
});
