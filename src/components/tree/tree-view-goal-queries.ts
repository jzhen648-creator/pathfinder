import type { AreaData, DomainHubData, TreeGoalNode } from "./tree-types";

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
