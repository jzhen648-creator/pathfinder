import { themePanelCopy } from "./theme-catalog";
import type { AreaData, DomainHubData, GoalBloomStatus, TreeGoalNode } from "@/components/tree/tree-types";

export type ThemeHubCoverage = {
  hubId: string;
  hubLabel: string;
  goalCount: number;
  momentCount: number;
  active: boolean;
};

export type ThemeSnapshot = {
  totalGoals: number;
  totalMoments: number;
  hubsWithGoals: number;
  hubsWithMoments: number;
  hubCount: number;
  goalsByBloom: Record<GoalBloomStatus, number>;
  hubCoverage: ThemeHubCoverage[];
  strengths: string[];
  gaps: string[];
  reflectionQuestions: string[];
};

function countGoalsInSubtree(nodes: TreeGoalNode[]): TreeGoalNode[] {
  const out: TreeGoalNode[] = [];
  for (const g of nodes) {
    out.push(g);
    out.push(...countGoalsInSubtree(g.childGoals));
  }
  return out;
}

function allGoalsInArea(area: AreaData): TreeGoalNode[] {
  return area.branches.flatMap((t) => countGoalsInSubtree(t.goals));
}

function nonSyntheticMoments(thread: DomainHubData) {
  return thread.moments.filter((m) => m.synthetic !== true);
}

/** Rule-based theme read — structured for future AI replacement. */
export function buildThemeSnapshot(area: AreaData): ThemeSnapshot {
  const catalog = themePanelCopy(area.id);
  const hubCoverage: ThemeHubCoverage[] = area.branches.map((thread) => {
    const hubLabel = thread.type.trim() || "Hub";
    const goalCount = countGoalsInSubtree(thread.goals).length;
    const momentCount = nonSyntheticMoments(thread).length;
    return {
      hubId: thread.id,
      hubLabel,
      goalCount,
      momentCount,
      active: goalCount > 0 || momentCount > 0,
    };
  });

  const allGoals = allGoalsInArea(area);
  const goalsByBloom: Record<GoalBloomStatus, number> = {
    BUD: 0,
    GROWING: 0,
    BLOOMED: 0,
    BRANCHED: 0,
    ENDED: 0,
  };
  for (const g of allGoals) {
    goalsByBloom[g.bloomStatus] += 1;
  }

  const totalGoals = allGoals.length;
  const totalMoments = hubCoverage.reduce((n, h) => n + h.momentCount, 0);
  const hubsWithGoals = hubCoverage.filter((h) => h.goalCount > 0).length;
  const hubsWithMoments = hubCoverage.filter((h) => h.momentCount > 0).length;
  const hubCount = area.branches.length;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const reflectionQuestions: string[] = [];

  if (totalGoals === 0 && totalMoments === 0) {
    gaps.push("This theme is still a blank canvas — no goals or timeline notes yet.");
    reflectionQuestions.push(catalog.lenses[0] ?? "What belongs in this part of your life?");
  } else {
    if (goalsByBloom.GROWING > 0) {
      strengths.push(
        `${goalsByBloom.GROWING} goal${goalsByBloom.GROWING === 1 ? "" : "s"} actively growing right now.`,
      );
    }
    if (goalsByBloom.BLOOMED > 0) {
      strengths.push(
        `${goalsByBloom.BLOOMED} goal${goalsByBloom.BLOOMED === 1 ? " has" : "s have"} bloomed — finished pursuits on the map.`,
      );
    }
    if (hubsWithGoals >= 2) {
      strengths.push(`Goals span ${hubsWithGoals} of ${hubCount} hubs — not concentrated on a single track.`);
    }
    if (hubsWithMoments >= 2) {
      strengths.push(`Timeline notes appear on ${hubsWithMoments} hubs — the story has breadth.`);
    } else if (totalMoments >= 3) {
      strengths.push(`${totalMoments} timeline notes capture how this theme has unfolded.`);
    }
    if (totalGoals > 0 && totalMoments > 0) {
      strengths.push("Both pursuits and timeline history are present — goals and story align.");
    }

    const emptyHubs = hubCoverage.filter((h) => !h.active);
    if (emptyHubs.length > 0 && emptyHubs.length < hubCount) {
      const names = emptyHubs.map((h) => h.hubLabel).join(", ");
      gaps.push(
        `${emptyHubs.length} hub${emptyHubs.length === 1 ? "" : "s"} quiet on the map: ${names}.`,
      );
    } else if (emptyHubs.length === hubCount && totalGoals === 0) {
      gaps.push("Every hub is empty — none of this theme's dimensions are mapped yet.");
    }

    if (totalGoals > 0 && totalMoments === 0) {
      gaps.push("Goals exist but the timeline is empty — the narrative of this theme isn't written yet.");
    }
    if (totalMoments > 0 && totalGoals === 0) {
      gaps.push("Timeline notes without active goals — history without current pursuits.");
    }
    if (hubsWithGoals === 1 && hubCount > 1) {
      const only = hubCoverage.find((h) => h.goalCount > 0)?.hubLabel ?? "one hub";
      gaps.push(`All goals sit on ${only} — other dimensions of this theme are untouched.`);
    }
    if (goalsByBloom.BUD > 0 && goalsByBloom.GROWING === 0 && goalsByBloom.BLOOMED === 0) {
      gaps.push(`${goalsByBloom.BUD} goal${goalsByBloom.BUD === 1 ? "" : "s"} still at bud — nothing in motion yet.`);
    }
  }

  if (strengths.length === 0 && totalGoals + totalMoments > 0) {
    strengths.push("You've started mapping this theme — more detail will sharpen the picture.");
  }
  if (gaps.length === 0 && totalGoals + totalMoments > 0) {
    gaps.push(...catalog.gapSignals.slice(0, 1));
  }

  const lensStart = Math.min(gaps.length, catalog.lenses.length);
  for (let i = 0; i < Math.min(3, catalog.lenses.length); i += 1) {
    const lens = catalog.lenses[(lensStart + i) % catalog.lenses.length]!;
    if (!reflectionQuestions.includes(lens)) reflectionQuestions.push(lens);
  }

  return {
    totalGoals,
    totalMoments,
    hubsWithGoals,
    hubsWithMoments,
    hubCount,
    goalsByBloom,
    hubCoverage,
    strengths: strengths.slice(0, 4),
    gaps: gaps.slice(0, 4),
    reflectionQuestions: reflectionQuestions.slice(0, 3),
  };
}
