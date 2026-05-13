import type { BloomStatus } from "@prisma/client";
import { computeGoalLifecycleBloom } from "@/lib/goal-bloom-lifecycle";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import { prisma } from "@/lib/prisma";

const LOG = "[recomputeGoalBloomStatus]";

function debugRecompute(): boolean {
  return process.env.PATHFINDER_DEBUG_RECOMPUTE_GOAL_BLOOM === "1";
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
 * Recomputes and persists goal bloom lifecycle (**BUD** / **GROWING** / **BLOOMED**).
 * Does not use continuation topology (`forkedGoals`); **BRANCHED** is no longer assigned here.
 * Does not change ENDED goals (user must clear ENDED via a future flow if ever needed).
 *
 * Lifecycle milestone semantics are delegated to {@link computeGoalLifecycleBloom} →
 * {@link milestoneDoneForSemantics} (explicit `completedAt` primary; subtask rollup only when subtasks exist).
 *
 * **Stabilization TODO:** every server path that creates/updates/deletes relational `Milestone` or `Subtask`
 * rows should call this (same request). Coverage is incomplete today — display-layer reconciliation in
 * `normalizeGoalBloomForDisplay` masks stale **BUD** in the tree until persistence is fixed or backfill runs.
 *
 * **Diagnostics:** `PATHFINDER_DEBUG_RECOMPUTE_GOAL_BLOOM=1` logs milestone shapes, per-milestone semantics,
 * computed bloom, and `prisma.goal.update` payload.
 */
export async function recomputeGoalBloomStatus(goalId: string): Promise<void> {
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
  if (goal.bloomStatus === "ENDED") {
    if (debugRecompute()) console.info(`${LOG} exit early: ENDED`, { goalId });
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
      persistedBloom: goal.bloomStatus,
      milestoneCount: milestones.length,
      milestones: milestonePayloadSummary(milestones),
    });
  }

  let next: BloomStatus;
  try {
    next = computeGoalLifecycleBloom(
      { goalType: goal.goalType, future: goal.future, year: goal.year },
      milestones,
      nowYear,
    ) as BloomStatus;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`${LOG} computeGoalLifecycleBloom threw`, {
      goalId,
      message: err.message,
      stack: err.stack,
      milestones: milestonePayloadSummary(milestones),
    });
    throw Object.assign(err, { phase: "recompute.computeGoalLifecycleBloom" });
  }

  let bloomedAt = goal.bloomedAt;
  if (next === "BLOOMED" && goal.bloomStatus !== "BLOOMED") {
    bloomedAt = new Date();
  } else if (next === "GROWING" || next === "BUD") {
    bloomedAt = null;
  }

  const bloomChanged = next !== goal.bloomStatus;
  const bloomedAtChanged = bloomedAt?.getTime() !== goal.bloomedAt?.getTime();

  if (debugRecompute()) {
    console.info(`${LOG} computed lifecycle`, {
      goalId,
      next,
      bloomChanged,
      bloomedAtChanged,
      prismaGoalUpdate: bloomChanged || bloomedAtChanged ? { bloomStatus: next, bloomedAt } : "(skip no-op)",
    });
  }

  if (!bloomChanged && !bloomedAtChanged) {
    return;
  }

  try {
    await prisma.goal.update({
      where: { id: goalId },
      data: {
        bloomStatus: next,
        bloomedAt,
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`${LOG} prisma.goal.update FAILED`, {
      goalId,
      data: { bloomStatus: next, bloomedAt },
      message: err.message,
      stack: err.stack,
    });
    throw Object.assign(err, { phase: "recompute.prisma.goal.update" });
  }

  if (debugRecompute()) {
    const verify = await prisma.goal.findUnique({
      where: { id: goalId },
      select: { bloomStatus: true, bloomedAt: true },
    });
    console.info(`${LOG} prisma.goal.update OK`, {
      goalId,
      persisted: verify,
    });
  }
}
