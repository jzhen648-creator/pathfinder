import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MILESTONE_MAP_CAP,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

function baseSignal(overrides: Partial<PursuitSignal> = {}): PursuitSignal {
  return {
    title: "Level 3 CeMAP apprenticeship at Kaplan",
    background: "Financial services route at Kaplan college.",
    backgroundChars: 40,
    enrichAnswerCount: 1,
    milestoneCount: 0,
    completedMilestoneCount: 0,
    hasDeadline: true,
    hasQuantifiedTarget: false,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("pursuit-enrich-readiness discovery properties", () => {
  it("P6: shouldSuggestMilestones is monotonic as milestoneCount increases", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (completedMilestoneCount, maxMilestoneCount) => {
          fc.pre(maxMilestoneCount >= completedMilestoneCount);

          const results: boolean[] = [];
          for (let milestoneCount = 0; milestoneCount <= maxMilestoneCount; milestoneCount += 1) {
            results.push(
              shouldSuggestMilestones(
                baseSignal({
                  milestoneCount,
                  completedMilestoneCount: Math.min(completedMilestoneCount, milestoneCount),
                }),
              ),
            );
          }

          let seenFalse = false;
          for (const allowed of results) {
            if (!allowed) seenFalse = true;
            else if (seenFalse) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it("P6: quantified targets always suppress milestone suggestions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (milestoneCount, completedMilestoneCount) => {
          fc.pre(completedMilestoneCount <= milestoneCount);
          expect(
            shouldSuggestMilestones(
              baseSignal({
                hasQuantifiedTarget: true,
                milestoneCount,
                completedMilestoneCount,
              }),
            ),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("P6: milestoneCount at cap never suggests milestones", () => {
    fc.assert(
      fc.property(fc.integer({ min: MILESTONE_MAP_CAP, max: MILESTONE_MAP_CAP + 6 }), (milestoneCount) => {
        expect(
          shouldSuggestMilestones(
            baseSignal({
              milestoneCount,
              completedMilestoneCount: milestoneCount,
            }),
          ),
        ).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});
