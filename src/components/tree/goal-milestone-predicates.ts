/**
 * Canonical milestone semantics for tree UI — relational `Milestone` rows only.
 * Hex dots are a projection (`milestone-tree-projection.ts`).
 */

import type { TreeGoalNode } from "./tree-types";

export function hasRelationalMilestones(goal: Pick<TreeGoalNode, "milestones">): boolean {
  return goal.milestones.length > 0;
}

export function hasServerOrbitalDots(goal: Pick<TreeGoalNode, "orbitalMilestones">): boolean {
  return goal.orbitalMilestones.length > 0;
}

export function hasMilestoneStructure(goal: Pick<TreeGoalNode, "milestones" | "orbitalMilestones">): boolean {
  return hasRelationalMilestones(goal) || hasServerOrbitalDots(goal);
}
