/**
 * Re-runs bloom lifecycle for every non-paused goal → **ACTIVE** / **COMPLETE**.
 * Safe to run multiple times. Repairs stale **ACTIVE** rows when milestones imply completion.
 *
 * Run from repo root: npm run backfill:goal-bloom
 */
import { PrismaClient } from "@prisma/client";
import { recomputeGoalBloomStatus } from "../src/lib/goal-bloom";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: { bloomStatus: { notIn: ["PAUSED", "ABANDONED", "MAINTAINING"] } },
    select: { id: true },
  });
  let ok = 0;
  for (const g of goals) {
    try {
      await recomputeGoalBloomStatus(g.id);
      ok += 1;
    } catch (e) {
      console.error(`recomputeGoalBloomStatus failed for ${g.id}`, e);
    }
  }
  console.log(`Backfill complete: recomputed ${ok} / ${goals.length} goals (excluding paused/maintaining/abandoned).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
