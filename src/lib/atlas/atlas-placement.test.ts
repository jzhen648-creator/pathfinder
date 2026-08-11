import { describe, expect, it } from "vitest";
import {
  ATLAS_DISPERSION_ORDER,
  ATLAS_SLOT_LIMIT,
  planAtlasPlacements,
} from "./atlas-placement";

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`);

describe("Atlas placement planning", () => {
  it("uses every authored slot exactly once", () => {
    expect(ATLAS_DISPERSION_ORDER).toHaveLength(ATLAS_SLOT_LIMIT);
    expect(new Set(ATLAS_DISPERSION_ORDER)).toHaveLength(ATLAS_SLOT_LIMIT);
    expect([...ATLAS_DISPERSION_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: ATLAS_SLOT_LIMIT }, (_, index) => index),
    );
  });

  it("disperses first Chapters in stable creation order", () => {
    expect(
      planAtlasPlacements(
        [
          { id: "later", createdAt: at(2) },
          { id: "first-b", createdAt: at(1) },
          { id: "first-a", createdAt: at(1) },
        ],
        [],
      ).create,
    ).toEqual([
      { goalId: "first-a", slot: 0 },
      { goalId: "first-b", slot: 8 },
      { goalId: "later", slot: 14 },
    ]);
  });

  it("never moves existing Chapters and assigns only a free slot to a new one", () => {
    const plan = planAtlasPlacements(
      [
        { id: "existing", createdAt: at(1) },
        { id: "new", createdAt: at(2) },
      ],
      [{ goalId: "existing", slot: 21 }],
    );
    expect(plan.create).toEqual([{ goalId: "new", slot: 0 }]);
  });

  it("keeps overflow Chapters reachable without inventing more geography", () => {
    const goals = Array.from({ length: 66 }, (_, index) => ({
      id: `goal-${String(index).padStart(2, "0")}`,
      createdAt: at(1),
    }));
    const plan = planAtlasPlacements(goals, []);
    expect(plan.create).toHaveLength(64);
    expect(plan.overflowGoalIds).toEqual(["goal-64", "goal-65"]);
  });
});
