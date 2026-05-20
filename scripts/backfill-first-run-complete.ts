/**
 * Mark first-run complete for users who already have map content (goals or marks).
 *
 * Run from repo root: npm run backfill:first-run
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const usersWithGoals = await prisma.user.findMany({
    where: {
      firstRunCompleted: false,
      goals: { some: { archived: false } },
    },
    select: { id: true, email: true },
  });

  const usersWithMarksOnly = await prisma.user.findMany({
    where: {
      firstRunCompleted: false,
      goals: { none: { archived: false } },
      marks: { some: { archived: false } },
    },
    select: { id: true, email: true },
  });

  const ids = new Set([
    ...usersWithGoals.map((u) => u.id),
    ...usersWithMarksOnly.map((u) => u.id),
  ]);

  if (ids.size === 0) {
    console.log("No users need first-run backfill.");
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: [...ids] } },
    data: { firstRunCompleted: true },
  });

  console.log(
    `Backfill complete: set firstRunCompleted=true for ${result.count} user(s) with existing goals or marks.`,
  );
  for (const u of [...usersWithGoals, ...usersWithMarksOnly]) {
    console.log(`  ${u.email}`);
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
