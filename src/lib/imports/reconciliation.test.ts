import { describe, expect, it } from "vitest";
import {
  consolidateReconciliationCandidates,
  partitionProposalCandidates,
  planProposalApplication,
  type ReconciliationCandidate,
} from "./reconciliation";

function candidate(
  overrides: Partial<ReconciliationCandidate> & Pick<ReconciliationCandidate, "id">,
): ReconciliationCandidate {
  return {
    classification: "new",
    proposedText: overrides.id,
    informationType: "fact",
    subjectType: "user",
    subjectLabel: null,
    memoryDestination: "background",
    backgroundCategory: "other",
    temporal: {
      state: "unknown",
      precision: "unknown",
      effectiveFrom: null,
      effectiveTo: null,
    },
    confidence: 0.8,
    evidence: [
      {
        segmentId: `segment-${overrides.id}`,
        startOffset: 0,
        endOffset: overrides.id.length,
        quote: overrides.id,
        role: "supports",
        supportType: "explicit",
      },
    ],
    ...overrides,
  };
}

describe("source reconciliation", () => {
  it("consolidates repeated meaning while preserving every exact citation", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "chatgpt",
        classification: "reinforcement",
        canonicalKey: "career-change",
        existingObservationId: "observation-1",
        evidence: [
          {
            segmentId: "segment-chatgpt",
            startOffset: 0,
            endOffset: 7,
            quote: "ChatGPT",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "claude",
        classification: "reinforcement",
        canonicalKey: "CAREER-CHANGE",
        existingObservationId: "observation-1",
        evidence: [
          {
            segmentId: "segment-claude",
            startOffset: 8,
            endOffset: 14,
            quote: "Claude",
            role: "supports",
            supportType: "explicit",
          },
        ],
        confidence: 0.9,
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.candidateIds).toEqual(["chatgpt", "claude"]);
    expect(result[0]?.evidence.map((evidence) => evidence.segmentId)).toEqual([
      "segment-chatgpt",
      "segment-claude",
    ]);
    expect(result[0]?.confidence).toBe(0.9);
  });

  it("does not collapse a conflict into an update with the same canonical key", () => {
    const result = consolidateReconciliationCandidates([
      candidate({ id: "update", classification: "update", canonicalKey: "leave-job" }),
      candidate({ id: "conflict", classification: "conflict", canonicalKey: "leave-job" }),
    ]);

    expect(result.map((item) => item.classification)).toEqual(["conflict", "update"]);
  });

  it("merges an explicit cross-segment repetition into its one matching update", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "career-progress",
        classification: "update",
        canonicalKey: "maya-mortgage-adviser-applications-interviews",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText:
          "Maya submitted twelve mortgage-adviser applications and booked two interviews.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 12,
            quote: "applications",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "career-clarification",
        classification: "reinforcement",
        canonicalKey: "mortgage-adviser-progress-clarification",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText:
          "The mortgage-adviser applications and two interviews are the same progress described above, not a second job search.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 32,
            quote: "same progress",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "update",
      candidateIds: ["career-clarification", "career-progress"],
    });
    expect(result[0]?.evidence.map((evidence) => evidence.segmentId)).toEqual([
      "segment-1",
      "segment-2",
    ]);
  });

  it("merges an explicit source-only repetition into its one matching new chapter", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "tour-experiment",
        classification: "new_chapter",
        canonicalKey: "maya-premium-tours-experiment",
        memoryDestination: "chapter",
        informationType: "event",
        proposedText:
          "Maya booked five customer-discovery interviews for a Mandarin tours experiment.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 10,
            quote: "five tours",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "tour-clarification",
        classification: "reinforcement",
        canonicalKey: "mandarin-tour-interviews-clarification",
        memoryDestination: "source_only",
        informationType: "context",
        proposedText:
          "The five Mandarin tour interviews repeat the same customer-discovery experiment, not five separate projects.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 15,
            endOffset: 26,
            quote: "repeat same",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "new_chapter",
      memoryDestination: "chapter",
      candidateIds: ["tour-clarification", "tour-experiment"],
    });
  });

  it("merges a near-verbatim implicit reinforcement for the same scoped identity", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "identity-detail",
        classification: "reinforcement",
        canonicalKey: "maya-british-indian-identity",
        backgroundCategory: "identity",
        proposedText: "Maya is a British-Indian woman with enduring ties to India.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 14,
            quote: "British-Indian",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "identity-repeat",
        classification: "new",
        canonicalKey: "user-identity-british-indian",
        backgroundCategory: "identity",
        proposedText: "Maya is British-Indian.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 34,
            quote: "British-Indian",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "new",
      candidateIds: ["identity-detail", "identity-repeat"],
    });
  });

  it("merges one strongly matching implicit chapter reinforcement", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "career-update",
        classification: "update",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText:
          "Maya submitted twelve mortgage-adviser applications and booked two interviews.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 12,
            quote: "applications",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "career-reinforcement",
        classification: "reinforcement",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText:
          "The mortgage-adviser applications and two interviews are career progress.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 32,
            quote: "career progress",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classification: "update" });
  });

  it("merges an exact-date cross-segment correction into the safer conflict", () => {
    const temporal = {
      state: "planned" as const,
      precision: "exact" as const,
      effectiveFrom: "2026-08-16",
      effectiveTo: null,
    };
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "return-update",
        classification: "update",
        canonicalKey: "maya-relocation-date",
        informationType: "event",
        temporal,
        proposedText: "Maya's confirmed return date to Manchester is 16 August 2026.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 11,
            quote: "16 August",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "return-conflict",
        classification: "conflict",
        canonicalKey: "user-return-date-conflict",
        temporal,
        proposedText: "The latest return date is 16 August 2026, not October.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 31,
            quote: "not October",
            role: "contradicts",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "conflict",
      candidateIds: ["return-conflict", "return-update"],
    });
    expect(result[0]?.evidence).toHaveLength(2);
  });

  it("uses an identical written date to merge a correction when one temporal field is missing", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "dated-update",
        classification: "update",
        temporal: {
          state: "planned",
          precision: "exact",
          effectiveFrom: "2026-08-16",
          effectiveTo: null,
        },
        proposedText: "Maya's return date to Manchester is 16 August 2026.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 11,
            quote: "16 August",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "written-date-conflict",
        classification: "conflict",
        temporal: {
          state: "planned",
          precision: "unknown",
          effectiveFrom: null,
          effectiveTo: null,
        },
        proposedText: "The latest return date is 16 August 2026, not October.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 31,
            quote: "not October",
            role: "contradicts",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "conflict",
      temporal: {
        state: "planned",
        precision: "exact",
        effectiveFrom: "2026-08-16",
        effectiveTo: null,
      },
    });
  });

  it("keeps genuine date conflicts and unrelated same-date facts separate", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "august-return",
        classification: "update",
        temporal: {
          state: "planned",
          precision: "exact",
          effectiveFrom: "2026-08-16",
          effectiveTo: null,
        },
        proposedText: "Maya plans to return to Manchester on 16 August 2026.",
      }),
      candidate({
        id: "october-return",
        classification: "conflict",
        temporal: {
          state: "planned",
          precision: "approximate",
          effectiveFrom: "2026-10-01",
          effectiveTo: null,
        },
        proposedText: "Maya may return to Manchester in October instead.",
      }),
      candidate({
        id: "august-dental",
        classification: "conflict",
        temporal: {
          state: "planned",
          precision: "exact",
          effectiveFrom: "2026-08-16",
          effectiveTo: null,
        },
        proposedText: "Maya's dental appointment is 16 August 2026, not September.",
      }),
    ]);

    expect(result).toHaveLength(3);
  });

  it("does not merge ambiguous repetition or similar wording across different people", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "career-applications",
        classification: "update",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText: "Maya submitted mortgage-adviser applications and booked interviews.",
      }),
      candidate({
        id: "career-interviews",
        classification: "update",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText: "Maya has mortgage-adviser interviews after several applications.",
      }),
      candidate({
        id: "ambiguous-clarification",
        classification: "reinforcement",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        proposedText:
          "The mortgage-adviser applications and interviews repeat the same career progress.",
      }),
      candidate({
        id: "brother-clarification",
        classification: "reinforcement",
        memoryDestination: "chapter",
        targetGoalIds: ["career"],
        subjectType: "other_person",
        subjectLabel: "Brother",
        proposedText:
          "The mortgage-adviser applications and interviews repeat the same career progress.",
      }),
    ]);

    expect(result).toHaveLength(4);
  });

  it("does not merge near-verbatim meaning assigned to incompatible destinations", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "background-place",
        classification: "reinforcement",
        memoryDestination: "background",
        backgroundCategory: "places",
        proposedText: "Manchester is Maya's intended long-term home base.",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 10,
            quote: "Manchester",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
      candidate({
        id: "home-chapter",
        classification: "new_chapter",
        memoryDestination: "chapter",
        backgroundCategory: null,
        proposedText: "Manchester is Maya's intended long-term home base.",
        evidence: [
          {
            segmentId: "segment-2",
            startOffset: 20,
            endOffset: 30,
            quote: "Manchester",
            role: "supports",
            supportType: "explicit",
          },
        ],
      }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("does not collapse the user's meaning with another person's similarly keyed information", () => {
    const result = consolidateReconciliationCandidates([
      candidate({ id: "user", canonicalKey: "career:qualification" }),
      candidate({
        id: "brother",
        canonicalKey: "career:qualification",
        subjectType: "other_person",
        subjectLabel: "Brother",
        backgroundCategory: "people",
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.subjectType).sort()).toEqual(["other_person", "user"]);
  });

  it("keeps exact evidence and all linked chapter targets", () => {
    const result = consolidateReconciliationCandidates([
      candidate({
        id: "cross-life",
        classification: "possible_connection",
        canonicalKey: "security-and-career",
        evidence: [
          {
            segmentId: "segment-1",
            startOffset: 0,
            endOffset: 8,
            quote: "Security",
            role: "supports",
            supportType: "explicit",
          },
        ],
        targetGoalIds: ["career", "money", "career"],
      }),
    ]);

    expect(result[0]?.evidence.map((evidence) => evidence.segmentId)).toEqual(["segment-1"]);
    expect(result[0]?.targetGoalIds).toEqual(["career", "money"]);
  });

  it("caps primary review work and retains low-confidence material outside the Inbox", () => {
    const candidates = [
      candidate({ id: "a", classification: "conflict" }),
      candidate({ id: "b", classification: "update" }),
      candidate({ id: "c", classification: "new_chapter" }),
      candidate({ id: "d", classification: "new" }),
      candidate({ id: "e", classification: "reinforcement" }),
      candidate({ id: "f", classification: "new" }),
      candidate({ id: "g", classification: "uncertain" }),
      candidate({ id: "h", classification: "no_durable_value" }),
    ];

    const result = partitionProposalCandidates(candidates);
    expect(result.primary).toHaveLength(5);
    expect(result.overflow).toHaveLength(1);
    expect(result.retainedOnly.map((item) => item.classification).sort()).toEqual([
      "no_durable_value",
      "uncertain",
    ]);
  });

  it("plans proposal application idempotently", () => {
    expect(planProposalApplication({ status: "PENDING" })).toEqual({ action: "apply" });
    expect(planProposalApplication({ status: "DEFERRED" })).toEqual({ action: "apply" });
    expect(planProposalApplication({ status: "ACCEPTED", revisionId: "revision-1" })).toEqual({
      action: "already_applied",
      revisionId: "revision-1",
    });
    expect(planProposalApplication({ status: "DISMISSED" })).toEqual({
      action: "blocked",
      reason: "dismissed",
    });
  });
});
