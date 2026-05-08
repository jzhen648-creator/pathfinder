"use client";

import type { MutableRefObject } from "react";
import { TreeGoalNodeSvg } from "./tree-goal-visual";
import type { AreaData, TreeGoalNode } from "./tree-types";
import { TreeElementGuideTag } from "./tree-element-guide-tag";
import { roadmapGoalShowsProgressPulse } from "./tree-view-badges";
import type { PanelState } from "./tree-view-types";
import { TREE_GOAL_MAX_CHILDREN_PER_NODE, TREE_GOAL_RENDER_MAX_DEPTH } from "./tree-view-constants";

export function renderGoalsSubtree(
  goal: TreeGoalNode,
  pos: { x: number; y: number },
  area: AreaData,
  areaColor: string,
  panel: PanelState,
  showAllGoalMilestones: boolean,
  bloomPlayingIds: Set<string>,
  onGoalClick: (g: TreeGoalNode, a: AreaData) => void,
  panMoved: MutableRefObject<boolean>,
  depth: number,
  showElementGuide: boolean,
) {
  const showMs =
    showAllGoalMilestones || (panel.type === "goal" && panel.goal.id === goal.id);
  const milestonesNodes = showMs
    ? goal.milestones.map((m, mi) => {
        const span = Math.max(1, goal.milestones.length);
        const ang = (mi / span) * Math.PI * 1.4 - Math.PI * 0.7;
        const mx = pos.x + Math.cos(ang) * 18;
        const my = pos.y + Math.sin(ang) * 18;
        return (
          <g key={m.id}>
            <title>{m.title}</title>
            <circle cx={mx} cy={my} r={3} fill={areaColor} opacity={0.82} pointerEvents="none" />
          </g>
        );
      })
    : null;

  const visibleChildren =
    depth < TREE_GOAL_RENDER_MAX_DEPTH
      ? goal.childGoals.slice(0, TREE_GOAL_MAX_CHILDREN_PER_NODE)
      : [];
  const childNodes = visibleChildren.map((c, ci) => {
    const n = visibleChildren.length;
    const ang = (ci / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    const len = 40 + depth * 10;
    const cpos = { x: pos.x + Math.cos(ang) * len, y: pos.y + Math.sin(ang) * len };
    return (
      <g key={c.id}>
        <line
          x1={pos.x}
          y1={pos.y}
          x2={cpos.x}
          y2={cpos.y}
          stroke={areaColor}
          strokeWidth={1.6}
          opacity={0.78}
          pointerEvents="none"
        />
        {renderGoalsSubtree(
          c,
          cpos,
          area,
          areaColor,
          panel,
          showAllGoalMilestones,
          bloomPlayingIds,
          onGoalClick,
          panMoved,
          depth + 1,
          showElementGuide,
        )}
      </g>
    );
  });

  return (
    <g>
      <TreeGoalNodeSvg
        cx={pos.x}
        cy={pos.y}
        color={areaColor}
        status={goal.bloomStatus}
        title={goal.title}
        pulseGrowing={roadmapGoalShowsProgressPulse(goal.bloomStatus)}
        bloomPlaying={bloomPlayingIds.has(goal.id)}
        onClick={() => {
          if (panMoved.current) return;
          onGoalClick(goal, area);
        }}
      />
      {showElementGuide ? <TreeElementGuideTag x={pos.x} y={pos.y - 14} text="roadmap-goal" /> : null}
      {milestonesNodes}
      {childNodes}
    </g>
  );
}
