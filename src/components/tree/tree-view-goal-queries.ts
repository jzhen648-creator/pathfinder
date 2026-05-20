import type { AreaData, DomainHubData, MomentNode, TreeGoalNode } from "./tree-types";

export function countRoadmapGoalsInSubtree(nodes: TreeGoalNode[]): number {
  let n = 0;
  for (const g of nodes) {
    n += 1;
    n += countRoadmapGoalsInSubtree(g.childGoals);
  }
  return n;
}

export function countRoadmapGoalsOnThread(thread: DomainHubData): number {
  return countRoadmapGoalsInSubtree(thread.goals);
}

export function countRoadmapGoalsInArea(area: AreaData): number {
  return area.branches.reduce((sum, t) => sum + countRoadmapGoalsOnThread(t), 0);
}

export function findGoalInList(goals: TreeGoalNode[], id: string): TreeGoalNode | null {
  for (const g of goals) {
    if (g.id === id) return g;
    const child = findGoalInList(g.childGoals, id);
    if (child) return child;
  }
  return null;
}

export function findGoalInAreas(
  areas: AreaData[],
  goalId: string,
): { goal: TreeGoalNode; area: AreaData } | null {
  for (const area of areas) {
    for (const branch of area.branches) {
      const found = findGoalInList(branch.goals, goalId);
      if (found) return { goal: found, area };
    }
  }
  return null;
}

/** True when `goalId` is this root goal or any nested continuation child. */
export function goalInSubtree(root: TreeGoalNode, goalId: string): boolean {
  if (root.id === goalId) return true;
  return root.childGoals.some((c) => goalInSubtree(c, goalId));
}

export function threadContainsGoal(goals: TreeGoalNode[], goalId: string): boolean {
  return findGoalInList(goals, goalId) != null;
}

export function findMarkInAreas(
  areas: AreaData[],
  markId: string,
): { moment: MomentNode; area: AreaData; hubLabel: string } | null {
  for (const area of areas) {
    for (const thread of area.branches) {
      const moment = thread.moments.find((m) => m.id === markId && m.synthetic !== true);
      if (moment) {
        return { moment, area, hubLabel: thread.type };
      }
    }
  }
  return null;
}
