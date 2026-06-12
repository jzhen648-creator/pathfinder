/**
 * Runtime check: relational milestone update + recomputeGoalStatus against dev.db.
 * Does not hit Next.js or auth — isolates Prisma + recompute only.
 *
 * Usage (from pathfinder/): npx tsx scripts/diagnose-milestone-recompute.ts
 *
 * Restores the touched milestone's completedAt after the probe unless --keep-completion is passed.
 *
 * Flags:
 *   --exercise-status-update — complete every milestone on the goal, run recompute (hits prisma.goal.update), restore.
 */
import { prisma } from "../src/lib/prisma";
import { milestoneDoneForSemantics } from "../src/lib/milestone-semantics";
import { recomputeGoalStatus } from "../src/lib/goal-status-recompute";

const keep = process.argv.includes("--keep-completion");
const exerciseStatusUpdate = process.argv.includes("--exercise-status-update");

async function main() {
  const milestone = await prisma.milestone.findFirst({
    where: {
      goal: { goalType: { notIn: ["moment", "event"] }, status: { not: "PAUSED" } },
    },
    include: {
      goal: { select: { id: true, goalType: true, status: true } },
      subtasks: { select: { id: true, title: true, isCompleted: true } },
    },
    orderBy: { position: "asc" },
  });

  if (!milestone) {
    console.log("[diagnose-milestone-recompute] No relational milestone on a roadmap goal — seed data first.");
    return;
  }

  const goalId = milestone.goalId;
  const prevCompletedAt = milestone.completedAt;
  const prevStatus = milestone.goal.status;

  console.log("[diagnose-milestone-recompute] picked milestone", {
    milestoneId: milestone.id,
    goalId,
    prevCompletedAt: prevCompletedAt?.toISOString() ?? null,
    subtaskCount: milestone.subtasks.length,
    semanticsBefore: milestoneDoneForSemantics({
      completedAt: milestone.completedAt,
      subtasks: milestone.subtasks.map((s) => ({
        isCompleted: s.isCompleted,
        title: s.title,
      })),
    }),
    goalStatusBefore: prevStatus,
  });

  const markAt = new Date();
  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { completedAt: markAt },
  });

  const afterPatch = await prisma.milestone.findUnique({
    where: { id: milestone.id },
    select: { completedAt: true },
  });
  console.log("[diagnose-milestone-recompute] after prisma milestone update", {
    completedAtPersisted: afterPatch?.completedAt?.toISOString() ?? null,
    matchesPatch: afterPatch?.completedAt?.getTime() === markAt.getTime(),
  });

  let recomputeOk = false;
  let recomputeErr: unknown;
  try {
    await recomputeGoalStatus(goalId);
    recomputeOk = true;
  } catch (e) {
    recomputeErr = e;
  }

  const goalAfter = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { status: true, completedAt: true },
  });

  console.log("[diagnose-milestone-recompute] after recomputeGoalStatus", {
    recomputeOk,
    error: recomputeOk
      ? undefined
      : recomputeErr instanceof Error
        ? { message: recomputeErr.message, stack: recomputeErr.stack }
        : recomputeErr,
    goalStatusAfter: goalAfter?.status,
    completedAtAfter: goalAfter?.completedAt?.toISOString() ?? null,
  });

  if (exerciseStatusUpdate) {
    const all = await prisma.milestone.findMany({
      where: { goalId },
      select: { id: true, completedAt: true },
    });
    const snapshot = all.map((m) => ({ id: m.id, at: m.completedAt }));
    const t = new Date();
    await prisma.$transaction(
      all.map((m) =>
        prisma.milestone.update({
          where: { id: m.id },
          data: { completedAt: t },
        }),
      ),
    );
    console.log("[diagnose-milestone-recompute] --exercise-status-update: marked all milestones complete", {
      count: all.length,
    });
    try {
      await recomputeGoalStatus(goalId);
    } catch (e) {
      console.error("[diagnose-milestone-recompute] recompute after full completion FAILED", e);
    }
    const goalStatusFull = await prisma.goal.findUnique({
      where: { id: goalId },
      select: { status: true, completedAt: true },
    });
    console.log("[diagnose-milestone-recompute] goal after full milestone completion", goalStatusFull);
    await prisma.$transaction(
      snapshot.map((s) =>
        prisma.milestone.update({
          where: { id: s.id },
          data: { completedAt: s.at },
        }),
      ),
    );
    await recomputeGoalStatus(goalId).catch((e) =>
      console.error("[diagnose-milestone-recompute] restore after exercise failed", e),
    );
    console.log("[diagnose-milestone-recompute] --exercise-status-update: restored all milestone completedAt.");
    if (!keep) {
      await prisma.milestone.update({
        where: { id: milestone.id },
        data: { completedAt: prevCompletedAt },
      });
      await recomputeGoalStatus(goalId).catch((e) =>
        console.error("[diagnose-milestone-recompute] final restore recompute failed", e),
      );
      console.log("[diagnose-milestone-recompute] restored probe milestone to original completedAt.");
    }
  }

  if (!keep && !exerciseStatusUpdate) {
    await prisma.milestone.update({
      where: { id: milestone.id },
      data: { completedAt: prevCompletedAt },
    });
    await recomputeGoalStatus(goalId).catch((e) =>
      console.error("[diagnose-milestone-recompute] restore recompute failed", e),
    );
    console.log("[diagnose-milestone-recompute] restored milestone completedAt + reran recompute.");
  } else if (keep && !exerciseStatusUpdate) {
    console.log("[diagnose-milestone-recompute] --keep-completion: left milestone completed.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
