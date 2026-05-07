import type { BloomStatus, Milestone, Subtask } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type MilestoneWithSubs = Milestone & { subtasks: Subtask[] };

/** Matches roadmap progress: a milestone is "done" when it has no subtasks or all are complete. */
export function milestoneIsFullyCompleted(milestone: MilestoneWithSubs): boolean {
  const { subtasks } = milestone;
  if (subtasks.length === 0) return true;
  return subtasks.every((s) => s.isCompleted);
}

/**
 * Recomputes and persists goal bloom from milestones/subtasks and forks.
 * Does not change ENDED goals (user must clear ENDED via a future flow if ever needed).
 */
export async function recomputeGoalBloomStatus(goalId: string): Promise<void> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: { include: { subtasks: true }, orderBy: { position: "asc" } },
      forkedGoals: { select: { id: true } },
    },
  });

  if (!goal || goal.bloomStatus === "ENDED") return;

  const forkCount = goal.forkedGoals.length;
  const milestones = goal.milestones;
  const nowYear = new Date().getFullYear();

  let next: BloomStatus;
  if (forkCount > 0) {
    next = "BRANCHED";
  } else if (milestones.length === 0) {
    if (goal.goalType === "moment" || goal.goalType === "event") {
      if (goal.future || (goal.year != null && goal.year > nowYear)) next = "BUD";
      else next = "BLOOMED";
    } else {
      next = "BUD";
    }
  } else if (milestones.every(milestoneIsFullyCompleted)) {
    next = "BLOOMED";
  } else if (milestones.some(milestoneIsFullyCompleted)) {
    next = "GROWING";
  } else {
    next = "BUD";
  }

  let bloomedAt = goal.bloomedAt;
  if (next === "BLOOMED" && goal.bloomStatus !== "BLOOMED") {
    bloomedAt = new Date();
  } else if (next === "GROWING" || next === "BUD") {
    bloomedAt = null;
  } else if (next === "BRANCHED") {
    bloomedAt = goal.bloomedAt;
  }

  if (next !== goal.bloomStatus || bloomedAt?.getTime() !== goal.bloomedAt?.getTime()) {
    await prisma.goal.update({
      where: { id: goalId },
      data: {
        bloomStatus: next,
        bloomedAt,
      },
    });
  }
}
