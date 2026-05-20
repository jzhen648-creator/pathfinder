import type { TreeGoalNode } from "./tree-types";

/** Flatten root goals and nested `childGoals` for parent-chain lookups. */
export function flattenGoalsById(goals: TreeGoalNode[]): Map<string, TreeGoalNode> {
  const map = new Map<string, TreeGoalNode>();
  const walk = (g: TreeGoalNode) => {
    map.set(g.id, g);
    for (const child of g.childGoals) walk(child);
  };
  for (const g of goals) walk(g);
  return map;
}

/**
 * Pursuit depth from `parentGoalId` chain: root = 1, one parent = 2, etc.
 * Broken chains (missing parent row) stop at the last resolved hop.
 */
export function goalPursuitDepth(goalId: string, byId: Map<string, TreeGoalNode>): number {
  let depth = 1;
  let cur = byId.get(goalId);
  while (cur?.parentGoalId) {
    depth += 1;
    cur = byId.get(cur.parentGoalId);
  }
  return depth;
}

/** Hub → depth-1 pursuit = 2.5; depth 2 = 1.5; depth 3+ = 1. */
export function pursuitConnectorStrokeWidth(depth: number): number {
  if (depth <= 1) return 2.5;
  if (depth === 2) return 1.5;
  return 1;
}

export function milestoneConnectorStrokeProps(): {
  strokeWidth: number;
  strokeDasharray: string;
} {
  return { strokeWidth: 0.75, strokeDasharray: "3 3" };
}
