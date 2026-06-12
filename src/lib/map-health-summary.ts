import type { PrismaClient } from "@prisma/client";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

export type MapHealthUserSummary = {
  email: string;
  categories: number;
  zeroDataCategories: number;
  orphanedGoals: number;
  nullShortLabels: number;
  maxContinuationDepth: number;
};

function isRoadmapGoal(goalType: string): boolean {
  return goalType !== "moment" && goalType !== "event";
}

function continuationDepths(goals: { id: string; parentGoalId: string | null }[]): number[] {
  const childrenByParent = new Map<string, string[]>();
  const ids = new Set(goals.map((g) => g.id));
  for (const g of goals) {
    if (!g.parentGoalId || !ids.has(g.parentGoalId)) continue;
    const list = childrenByParent.get(g.parentGoalId) ?? [];
    list.push(g.id);
    childrenByParent.set(g.parentGoalId, list);
  }

  const roots = goals.filter((g) => !g.parentGoalId || !ids.has(g.parentGoalId));
  const depths: number[] = [];

  function walk(id: string, depth: number) {
    depths.push(depth);
    for (const childId of childrenByParent.get(id) ?? []) {
      walk(childId, depth + 1);
    }
  }

  for (const root of roots) {
    walk(root.id, 1);
  }
  return depths;
}

/** Lightweight per-user map audit for cron / ops (no console output). */
export async function summarizeMapHealthForUser(
  prisma: PrismaClient,
  userId: string,
  email: string,
): Promise<MapHealthUserSummary> {
  const branches = await prisma.themeCategory.findMany({
    where: { userId },
    select: { id: true, themeId: true, label: true, name: true },
  });
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: {
      id: true,
      categoryId: true,
      parentGoalId: true,
      goalType: true,
      shortLabel: true,
    },
  });
  const marks = await prisma.mark.findMany({
    where: { userId, archived: false },
    select: { categoryId: true },
  });
  const milestones = await prisma.milestone.findMany({
    where: { goal: { userId, archived: false } },
    select: { goalId: true },
  });

  const branchIds = new Set(branches.map((b) => b.id));
  const goalsByBranch = new Map<string, number>();
  const marksByBranch = new Map<string, number>();
  const milestonesByBranch = new Map<string, number>();

  for (const g of goals) {
    if (!g.categoryId) continue;
    goalsByBranch.set(g.categoryId, (goalsByBranch.get(g.categoryId) ?? 0) + 1);
  }
  for (const m of marks) {
    marksByBranch.set(m.categoryId, (marksByBranch.get(m.categoryId) ?? 0) + 1);
  }
  const goalToBranch = new Map(goals.map((g) => [g.id, g.categoryId]));
  for (const ms of milestones) {
    const branchId = goalToBranch.get(ms.goalId);
    if (!branchId) continue;
    milestonesByBranch.set(branchId, (milestonesByBranch.get(branchId) ?? 0) + 1);
  }

  let zeroDataCategories = 0;
  for (const b of branches) {
    const g = goalsByBranch.get(b.id) ?? 0;
    const m = marksByBranch.get(b.id) ?? 0;
    const ms = milestonesByBranch.get(b.id) ?? 0;
    if (g === 0 && m === 0 && ms === 0) zeroDataCategories += 1;
  }

  const goalIds = new Set(goals.map((g) => g.id));
  const orphanedGoals = goals.filter(
    (g) =>
      g.categoryId == null ||
      !branchIds.has(g.categoryId) ||
      (g.parentGoalId != null && !goalIds.has(g.parentGoalId)),
  ).length;

  const nullShortLabels = goals.filter(
    (g) => isRoadmapGoal(g.goalType) && (g.shortLabel == null || g.shortLabel.trim() === ""),
  ).length;

  const chainGoals = goals.filter((g) => isRoadmapGoal(g.goalType));
  const depths = continuationDepths(chainGoals);

  const themesMissing = LIFE_AREA_IDS.filter(
    (themeId) => !branches.some((b) => b.themeId === themeId),
  );

  return {
    email,
    categories: branches.length,
    zeroDataCategories: zeroDataCategories + themesMissing.length,
    orphanedGoals,
    nullShortLabels,
    maxContinuationDepth: depths.length > 0 ? Math.max(...depths) : 0,
  };
}
