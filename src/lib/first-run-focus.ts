import { ONBOARDING_LIMB_OPTIONS } from "@/components/onboarding/onboarding-limbs";
import type { AreaData, TreeGoalNode } from "@/components/tree/tree-types";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";

export type FirstRunFocusTarget =
  | { kind: "goal"; area: AreaData; goal: TreeGoalNode }
  | {
      kind: "mark";
      area: AreaData;
      markId: string;
      branchId: string;
      hubLabel: string;
    };

/** Primary theme for first-run Stream — persisted id, else first active in onboarding display order. */
export function resolveFirstRunPrimaryLimbId(
  primaryLimbId: string | null,
  areas: AreaData[],
): LifeAreaId | null {
  if (
    primaryLimbId &&
    (LIFE_AREA_IDS as readonly string[]).includes(primaryLimbId) &&
    areas.some((a) => a.id === primaryLimbId)
  ) {
    return primaryLimbId as LifeAreaId;
  }
  for (const opt of ONBOARDING_LIMB_OPTIONS) {
    if (areas.some((a) => a.id === opt.id)) return opt.id;
  }
  return (areas[0]?.id as LifeAreaId | undefined) ?? null;
}

/** First committed pursuit on the primary theme, else first timeline mark. */
export function findFirstRunFocusTarget(
  areas: AreaData[],
  primaryLimbId: string | null,
): FirstRunFocusTarget | null {
  const limbId = resolveFirstRunPrimaryLimbId(primaryLimbId, areas);
  if (!limbId) return null;

  const area = areas.find((a) => a.id === limbId);
  if (!area) return null;

  for (const thread of area.branches) {
    const rootGoal = thread.goals[0];
    if (rootGoal) {
      return { kind: "goal", area, goal: rootGoal };
    }
  }

  for (const thread of area.branches) {
    const moment = thread.moments.find((m) => m.synthetic !== true);
    if (moment) {
      return {
        kind: "mark",
        area,
        markId: moment.id,
        branchId: moment.branchId,
        hubLabel: thread.type,
      };
    }
  }

  return null;
}
