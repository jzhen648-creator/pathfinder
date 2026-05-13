/**
 * Re-runs bloom lifecycle for every non-ENDED goal so legacy **BRANCHED** rows (continuation topology)
 * migrate to **BUD** / **GROWING** / **BLOOMED**. Safe to run multiple times.
 *
 * Also repairs stale **BUD** rows when relational milestones exist (until mutation paths all call recompute).
 *
 * Run from repo root: npm run backfill:goal-bloom
 */
import { PrismaClient } from "@prisma/client";
import { recomputeGoalBloomStatus } from "../src/lib/goal-bloom";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: { bloomStatus: { not: "ENDED" } },
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
  console.log(`Backfill complete: recomputed ${ok} / ${goals.length} goals (excluding ENDED).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
