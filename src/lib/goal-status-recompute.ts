import type { PursuitStatus } from "@prisma/client";
import { computeGoalLifecycleStatus } from "@/lib/goal-status-lifecycle";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import { prisma } from "@/lib/prisma";

const LOG = "[recomputeGoalStatus]";

function debugRecompute(): boolean {
  return (
    process.env.PATHFINDER_DEBUG_RECOMPUTE_GOAL_STATUS === "1" ||
    process.env.PATHFINDER_DEBUG_RECOMPUTE_GOAL_BLOOM === "1"
  );
}

function milestonePayloadSummary(
  milestones: Array<{
    id: string;
    position: number;
    completedAt: Date | null;
    subtasks: { isCompleted: boolean; title: string }[];
  }>,
) {
  return milestones.map((m) => ({
    id: m.id,
    position: m.position,
    completedAt: m.completedAt?.toISOString?.() ?? null,
    subtaskCount: m.subtasks.length,
    subtasksCompleted: m.subtasks.map((s) => s.isCompleted),
    milestoneDoneForSemantics: milestoneDoneForSemantics({
      completedAt: m.completedAt,
      subtasks: m.subtasks.map((s) => ({ isCompleted: s.isCompleted, title: s.title })),
    }),
  }));
}

/**
 * Recomputes and persists pursuit lifecycle status (**ACTIVE** / **COMPLETE**).
 * Does not use continuation topology (`forkedGoals`).
 * Does not change PAUSED, ABANDONED, or MAINTAINING pursuits (user-set; never auto-computed).
 *
 * Lifecycle milestone semantics are delegated to {@link computeGoalLifecycleStatus} →
 * {@link milestoneDoneForSemantics} (explicit `completedAt` primary; subtask rollup only when subtasks exist).
 *
 * **Diagnostics:** `PATHFINDER_DEBUG_RECOMPUTE_GOAL_STATUS=1` logs milestone shapes, per-milestone semantics,
 * computed status, and `prisma.goal.update` payload.
 */
export async function recomputeGoalStatus(goalId: string): Promise<void> {
  let goal;
  try {
    goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        milestones: { include: { subtasks: true }, orderBy: { position: "asc" } },
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`${LOG} prisma.goal.findUnique failed`, { goalId, message: err.message, stack: err.stack });
    throw Object.assign(err, { phase: "recompute.prisma.goal.findUnique" });
  }

  if (!goal) {
    if (debugRecompute()) console.info(`${LOG} exit early: goal not found`, { goalId });
    return;
  }
  if (goal.status === "PAUSED" || goal.status === "ABANDONED" || goal.status === "MAINTAINING") {
    if (debugRecompute()) {
      console.info(`${LOG} exit early: ${goal.status}`, { goalId });
    }
    return;
  }

  const milestones = goal.milestones;
  const nowYear = new Date().getFullYear();

  if (debugRecompute()) {
    console.info(`${LOG} loaded goal`, {
      goalId,
      goalType: goal.goalType,
      future: goal.future,
      year: goal.year,
      persistedStatus: goal.status,
      milestoneCount: milestones.length,
      milestones: milestonePayloadSummary(milestones),
    });
  }

  let next: PursuitStatus;
  try {
    next = computeGoalLifecycleStatus(
      { goalType: goal.goalType, future: goal.future, year: goal.year },
      milestones,
      nowYear,
    ) as PursuitStatus;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`${LOG} computeGoalLifecycleStatus threw`, {
      goalId,
      message: err.message,
      stack: err.stack,
      milestones: milestonePayloadSummary(milestones),
    });
    throw Object.assign(err, { phase: "recompute.computeGoalLifecycleStatus" });
  }

  let completedAt = goal.completedAt;
  if (next === "COMPLETE" && goal.status !== "COMPLETE") {
    completedAt = new Date();
  } else if (next === "ACTIVE") {
    completedAt = null;
  }

  const statusChanged = next !== goal.status;
  const completedAtChanged = completedAt?.getTime() !== goal.completedAt?.getTime();

  if (debugRecompute()) {
    console.info(`${LOG} computed lifecycle`, {
      goalId,
      next,
      statusChanged,
      completedAtChanged,
      prismaGoalUpdate:
        statusChanged || completedAtChanged ? { status: next, completedAt } : "(skip no-op)",
    });
  }

  if (!statusChanged && !completedAtChanged) {
    return;
  }

  try {
    await prisma.goal.update({
      where: { id: goalId },
      data: {
        status: next,
        completedAt,
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`${LOG} prisma.goal.update FAILED`, {
      goalId,
      data: { status: next, completedAt },
      message: err.message,
      stack: err.stack,
    });
    throw Object.assign(err, { phase: "recompute.prisma.goal.update" });
  }

  if (debugRecompute()) {
    const verify = await prisma.goal.findUnique({
      where: { id: goalId },
      select: { status: true, completedAt: true },
    });
    console.info(`${LOG} prisma.goal.update OK`, {
      goalId,
      persisted: verify,
    });
  }
}
