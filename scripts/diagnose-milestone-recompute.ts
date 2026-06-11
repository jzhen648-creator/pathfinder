/**
 * Runtime check: relational milestone update + recomputeGoalBloomStatus against dev.db.
 * Does not hit Next.js or auth — isolates Prisma + recompute only.
 *
 * Usage (from pathfinder/): npx tsx scripts/diagnose-milestone-recompute.ts
 *
 * Restores the touched milestone's completedAt after the probe unless --keep-completion is passed.
 *
 * Flags:
 *   --exercise-bloom-update — complete every milestone on the goal, run recompute (hits prisma.goal.update), restore.
 */
import { prisma } from "../src/lib/prisma";
import { milestoneDoneForSemantics } from "../src/lib/milestone-semantics";
import { recomputeGoalBloomStatus } from "../src/lib/goal-bloom";

const keep = process.argv.includes("--keep-completion");
const exerciseBloomUpdate = process.argv.includes("--exercise-bloom-update");

async function main() {
  const milestone = await prisma.milestone.findFirst({
    where: {
      goal: { goalType: { notIn: ["moment", "event"] }, bloomStatus: { not: "PAUSED" } },
    },
    include: {
      goal: { select: { id: true, goalType: true, bloomStatus: true } },
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
  const prevBloom = milestone.goal.bloomStatus;

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
    goalBloomBefore: prevBloom,
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
    await recomputeGoalBloomStatus(goalId);
    recomputeOk = true;
  } catch (e) {
    recomputeErr = e;
  }

  const goalAfter = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { bloomStatus: true, bloomedAt: true },
  });

  console.log("[diagnose-milestone-recompute] after recomputeGoalBloomStatus", {
    recomputeOk,
    error: recomputeOk
      ? undefined
      : recomputeErr instanceof Error
        ? { message: recomputeErr.message, stack: recomputeErr.stack }
        : recomputeErr,
    goalBloomAfter: goalAfter?.bloomStatus,
    bloomedAtAfter: goalAfter?.bloomedAt?.toISOString() ?? null,
  });

  if (exerciseBloomUpdate) {
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
    console.log("[diagnose-milestone-recompute] --exercise-bloom-update: marked all milestones complete", {
      count: all.length,
    });
    try {
      await recomputeGoalBloomStatus(goalId);
    } catch (e) {
      console.error("[diagnose-milestone-recompute] recompute after full completion FAILED", e);
    }
    const goalBloomFull = await prisma.goal.findUnique({
      where: { id: goalId },
      select: { bloomStatus: true, bloomedAt: true },
    });
    console.log("[diagnose-milestone-recompute] goal after full milestone completion", goalBloomFull);
    await prisma.$transaction(
      snapshot.map((s) =>
        prisma.milestone.update({
          where: { id: s.id },
          data: { completedAt: s.at },
        }),
      ),
    );
    await recomputeGoalBloomStatus(goalId).catch((e) =>
      console.error("[diagnose-milestone-recompute] restore after exercise failed", e),
    );
    console.log("[diagnose-milestone-recompute] --exercise-bloom-update: restored all milestone completedAt.");
    if (!keep) {
      await prisma.milestone.update({
        where: { id: milestone.id },
        data: { completedAt: prevCompletedAt },
      });
      await recomputeGoalBloomStatus(goalId).catch((e) =>
        console.error("[diagnose-milestone-recompute] final restore recompute failed", e),
      );
      console.log("[diagnose-milestone-recompute] restored probe milestone to original completedAt.");
    }
  }

  if (!keep && !exerciseBloomUpdate) {
    await prisma.milestone.update({
      where: { id: milestone.id },
      data: { completedAt: prevCompletedAt },
    });
    await recomputeGoalBloomStatus(goalId).catch((e) =>
      console.error("[diagnose-milestone-recompute] restore recompute failed", e),
    );
    console.log("[diagnose-milestone-recompute] restored milestone completedAt + reran recompute.");
  } else if (keep && !exerciseBloomUpdate) {
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
