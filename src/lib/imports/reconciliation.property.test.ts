import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  partitionProposalCandidates,
  type ReconciliationCandidate,
  type ReconciliationClass,
} from "./reconciliation";

const classifications: ReconciliationClass[] = [
  "new",
  "reinforcement",
  "update",
  "conflict",
  "possible_connection",
  "new_chapter",
  "no_durable_value",
  "uncertain",
];

describe("reconciliation properties", () => {
  it("never loses candidate provenance and never exceeds the review cap", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 12 }),
            classification: fc.constantFrom(...classifications),
            canonicalKey: fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null }),
            proposedText: fc.string({ minLength: 1, maxLength: 40 }),
            informationType: fc.constant("fact"),
            subjectType: fc.constant("user"),
            subjectLabel: fc.constant(null),
            memoryDestination: fc.constant("background"),
            backgroundCategory: fc.constant("other"),
            temporal: fc.constant({
              state: "unknown",
              precision: "unknown",
              effectiveFrom: null,
              effectiveTo: null,
            }),
            confidence: fc.double({ min: 0, max: 1, noNaN: true }),
            evidence: fc.uniqueArray(
              fc.record({
                segmentId: fc.string({ minLength: 1, maxLength: 10 }),
                startOffset: fc.nat({ max: 40 }),
                endOffset: fc.integer({ min: 41, max: 80 }),
                quote: fc.string({ minLength: 1, maxLength: 40 }),
                role: fc.constant("supports"),
                supportType: fc.constant("explicit"),
              }),
              { selector: (value) => `${value.segmentId}:${value.startOffset}:${value.endOffset}`, maxLength: 4 },
            ),
            targetGoalIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), {
              maxLength: 3,
            }),
            existingObservationId: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
              nil: null,
            }),
          }),
          { selector: (value) => value.id, maxLength: 30 },
        ),
        fc.integer({ min: 0, max: 10 }),
        (candidates, limit) => {
          const result = partitionProposalCandidates(
            candidates as ReconciliationCandidate[],
            limit,
          );
          const consolidated = [...result.primary, ...result.overflow, ...result.retainedOnly];
          const candidateIds = consolidated.flatMap((item) => item.candidateIds).sort();
          const inputIds = candidates.map((item) => item.id).sort();

          expect(result.primary.length).toBeLessThanOrEqual(limit);
          expect(candidateIds).toEqual(inputIds);
          expect([...result.primary, ...result.overflow]).not.toContainEqual(
            expect.objectContaining({ classification: "no_durable_value" }),
          );
          expect([...result.primary, ...result.overflow]).not.toContainEqual(
            expect.objectContaining({ classification: "uncertain" }),
          );
          expect([...result.primary, ...result.overflow]).not.toContainEqual(
            expect.objectContaining({ classification: "reinforcement" }),
          );
        },
      ),
      { numRuns: 250 },
    );
  });
});
