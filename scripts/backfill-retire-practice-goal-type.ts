/**
 * Retire goalType `practice` → `project` with bloomStatus MAINTAINING (unless COMPLETE / ON_HOLD).
 *
 * Run from pathfinder/: npm run backfill:retire-practice
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.goal.findMany({
    where: { goalType: "practice" },
    select: { id: true, bloomStatus: true },
  });

  let updated = 0;
  for (const row of rows) {
    const bloomStatus =
      row.bloomStatus === "COMPLETE" || row.bloomStatus === "ON_HOLD"
        ? row.bloomStatus
        : "MAINTAINING";
    await prisma.goal.update({
      where: { id: row.id },
      data: { goalType: "project", bloomStatus },
    });
    updated += 1;
  }

  console.log(`Backfill complete: migrated ${updated} practice goal(s) to project.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
