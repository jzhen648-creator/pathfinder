/**
 * Re-runs pursuit lifecycle status for timeline **moment/event** rows only.
 * Normal pursuits: completion is user-driven — this script is a no-op for them after the milestone fix.
 *
 * Run from repo root: npm run backfill:goal-status
 */
import { PrismaClient } from "@prisma/client";
import { recomputeGoalStatus } from "../src/lib/goal-status-recompute";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: {
      status: { notIn: ["PAUSED", "MAINTAINING"] },
      goalType: { in: ["moment", "event"] },
    },
    select: { id: true },
  });
  let ok = 0;
  for (const g of goals) {
    try {
      await recomputeGoalStatus(g.id);
      ok += 1;
    } catch (e) {
      console.error(`recomputeGoalStatus failed for ${g.id}`, e);
    }
  }
  console.log(
    `Backfill complete: recomputed ${ok} / ${goals.length} pursuits (excluding paused/maintaining/abandoned).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
