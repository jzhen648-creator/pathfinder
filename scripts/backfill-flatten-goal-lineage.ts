/**
 * Clear Goal.parentGoalId — pursuits are peers within a theme section (no nest tree).
 *
 * Run from pathfinder/: npm run backfill:flatten-goal-lineage
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const nested = await prisma.goal.count({
    where: { parentGoalId: { not: null }, archived: false },
  });

  const result = await prisma.goal.updateMany({
    where: { parentGoalId: { not: null } },
    data: { parentGoalId: null },
  });

  console.log(
    `Backfill complete: cleared parentGoalId on ${result.count} goal(s) (${nested} were active).`,
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
