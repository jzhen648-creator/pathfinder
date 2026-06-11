/**
 * Retire goalType `identity` → `project` (preserve bloomStatus).
 *
 * Run from pathfinder/: npm run backfill:retire-identity
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.goal.findMany({
    where: { goalType: "identity" },
    select: { id: true, status: true },
  });

  let updated = 0;
  for (const row of rows) {
    await prisma.goal.update({
      where: { id: row.id },
      data: { goalType: "project" },
    });
    updated += 1;
  }

  console.log(`Backfill complete: migrated ${updated} identity goal(s) to project.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
