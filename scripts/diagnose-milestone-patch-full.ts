/**
 * Full PATCH path probe: prisma update + recompute + markPursuitReadingDirty.
 * Usage: npx tsx scripts/diagnose-milestone-patch-full.ts
 */
import { prisma } from "../src/lib/prisma";
import { recomputeGoalStatus } from "../src/lib/goal-status-recompute";
import { markPursuitReadingDirty } from "../src/lib/map/reading-dirty-ledger";

async function main() {
  const milestone = await prisma.milestone.findFirst({
    where: { goal: { goalType: { notIn: ["moment", "event"] } } },
    include: { goal: { select: { id: true, userId: true, title: true } } },
  });
  if (!milestone) {
    console.log("[diagnose-milestone-patch-full] no milestone found");
    return;
  }

  const prev = milestone.completedAt;
  const userId = milestone.goal.userId;
  const goalId = milestone.goalId;
  const markAt = new Date("2026-06-19T00:00:00.000Z");

  console.log("[diagnose-milestone-patch-full] probing", {
    milestoneId: milestone.id,
    goalId,
    userId,
  });

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { completedAt: markAt },
  });
  console.log("[diagnose-milestone-patch-full] prisma.milestone.update OK");

  await recomputeGoalStatus(goalId);
  console.log("[diagnose-milestone-patch-full] recomputeGoalStatus OK");

  await markPursuitReadingDirty(userId, goalId, "milestone_updated", {
    details: {
      title: milestone.goal.title,
      milestoneTitle: milestone.title,
      changes: [
        {
          field: "milestoneCompleted",
          from: prev ? "true" : "false",
          to: "true",
        },
      ],
    },
  });
  console.log("[diagnose-milestone-patch-full] markPursuitReadingDirty OK");

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { completedAt: prev },
  });
  await recomputeGoalStatus(goalId).catch((e) =>
    console.error("[diagnose-milestone-patch-full] restore recompute failed", e),
  );
  console.log("[diagnose-milestone-patch-full] restored milestone");
}

main()
  .catch((e) => {
    console.error("[diagnose-milestone-patch-full] FAILED", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
