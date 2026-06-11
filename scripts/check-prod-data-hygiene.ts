/**
 * Read-only prod hygiene check — ON_HOLD rows and nested parentGoalId.
 * Run from pathfinder/: npx tsx scripts/check-prod-data-hygiene.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const onHold = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "Goal" WHERE "bloomStatus"::text = 'ON_HOLD'
  `;
  const nestedActive = await prisma.goal.count({
    where: { parentGoalId: { not: null }, archived: false },
  });
  const nestedAll = await prisma.goal.count({
    where: { parentGoalId: { not: null } },
  });

  console.log(
    JSON.stringify(
      {
        onHoldGoals: Number(onHold[0]?.count ?? 0),
        nestedActiveGoals: nestedActive,
        nestedAllGoals: nestedAll,
        needsBackfill: Number(onHold[0]?.count ?? 0) > 0 || nestedAll > 0,
      },
      null,
      2,
    ),
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
