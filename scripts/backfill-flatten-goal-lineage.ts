/**
 * Clear Goal.parentGoalId — pursuits are peers within a theme section (no nest tree).
 * Also migrates any legacy bloomStatus ON_HOLD rows to PAUSED (pre-enum migration stragglers).
 *
 * Run from pathfinder/: npm run backfill:flatten-goal-lineage
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countLegacyOnHold(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Goal"
    WHERE "bloomStatus"::text = 'ON_HOLD'
  `;
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const legacyOnHold = await countLegacyOnHold();
  if (legacyOnHold > 0) {
    const migrated = await prisma.$executeRaw`
      UPDATE "Goal"
      SET "bloomStatus" = 'PAUSED'::"BloomStatus"
      WHERE "bloomStatus"::text = 'ON_HOLD'
    `;
    console.log(`Migrated ${migrated} goal(s) from ON_HOLD → PAUSED.`);
  } else {
    console.log("No ON_HOLD bloomStatus rows found.");
  }

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
