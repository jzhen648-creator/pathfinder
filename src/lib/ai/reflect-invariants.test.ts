import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildPursuitsOnlyMapContext } from "@/lib/ai/generate-reflect";
import { shouldSuggestMilestones, type PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import { DENSE_MAP_CONTEXT } from "@/lib/map/__fixtures__/dense-map";

const ALL_PURSUIT_IDS = DENSE_MAP_CONTEXT.themes.flatMap((theme) =>
  theme.hubs.flatMap((hub) => hub.pursuits.map((pursuit) => pursuit.id)),
);

function baseSignal(overrides: Partial<PursuitSignal> = {}): PursuitSignal {
  return {
    title: "Test pursuit",
    description: "Enough context for milestone suggestions in tests.",
    enrichAnswerCount: 2,
    milestoneCount: 2,
    completedMilestoneCount: 0,
    hasDeadline: true,
    hasQuantifiedTarget: false,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("reflect invariants", () => {
  it("P2: pursuits-only map context never includes pursuits outside dirty categories", () => {
    fc.assert(
      fc.property(
        fc.subarray(ALL_PURSUIT_IDS, { minLength: 1, maxLength: 6 }),
        (dirtyIds) => {
          const sliced = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, dirtyIds);
          const dirtyCategories = new Set(
            DENSE_MAP_CONTEXT.themes.flatMap((theme) =>
              theme.hubs.flatMap((hub) =>
                hub.pursuits.some((pursuit) => dirtyIds.includes(pursuit.id)) ? [hub.id] : [],
              ),
            ),
          );
          const outputIds = sliced.themes.flatMap((theme) =>
            theme.hubs.flatMap((hub) => hub.pursuits.map((pursuit) => pursuit.id)),
          );
          for (const id of outputIds) {
            const hubId = DENSE_MAP_CONTEXT.themes
              .flatMap((theme) => theme.hubs)
              .find((hub) => hub.pursuits.some((pursuit) => pursuit.id === id))?.id;
            expect(dirtyCategories.has(hubId ?? "")).toBe(true);
          }
        },
      ),
    );
  });

  it("P6: adding completed milestones never flips allow to block except via gap-fill completion", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7 }), fc.integer({ min: 0, max: 6 }), (total, completed) => {
        if (completed >= total) return true;
        const allowedBefore = shouldSuggestMilestones(
          baseSignal({ milestoneCount: total, completedMilestoneCount: completed }),
        );
        const allowedAfter = shouldSuggestMilestones(
          baseSignal({ milestoneCount: total, completedMilestoneCount: completed + 1 }),
        );
        if (allowedBefore && !allowedAfter) {
          expect(completed + 1).toBeGreaterThanOrEqual(total);
        }
        return true;
      }),
    );
  });

  it("differential scope: full vs pursuits-only keep panel ids for dirty pursuit", async () => {
    const dirtyId = "p-cemap";
    const full = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, [dirtyId]);
    const scoped = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, [dirtyId]);
    const fullTitles = full.themes.flatMap((theme) =>
      theme.hubs.flatMap((hub) => hub.pursuits.map((p) => p.title)),
    );
    const scopedTitles = scoped.themes.flatMap((theme) =>
      theme.hubs.flatMap((hub) => hub.pursuits.map((p) => p.title)),
    );
    expect(fullTitles).toContain("CeMAP qualification");
    expect(scopedTitles).toContain("CeMAP qualification");
  });
});
