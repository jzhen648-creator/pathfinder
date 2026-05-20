import type { AreaData } from "./tree-types";
import { countRoadmapGoalsInArea } from "./tree-view-goal-queries";

export type TreeMapHudStats = {
  themeCount: number;
  hubCount: number;
  pursuitCount: number;
  unresolvedCount: number;
};

export function computeTreeMapHudStats(areas: AreaData[], hiddenAreaIds: ReadonlySet<string>): TreeMapHudStats {
  const visible = areas.filter((a) => !hiddenAreaIds.has(a.id));
  let pursuitCount = 0;
  let hubCount = 0;
  let unresolvedCount = 0;

  for (const area of visible) {
    pursuitCount += countRoadmapGoalsInArea(area);
    hubCount += area.branches.length;
    for (const thread of area.branches) {
      unresolvedCount += thread.moments.filter(
        (m) => m.needsResolution === true && m.synthetic !== true,
      ).length;
    }
  }

  return {
    themeCount: visible.length,
    hubCount,
    pursuitCount,
    unresolvedCount,
  };
}
