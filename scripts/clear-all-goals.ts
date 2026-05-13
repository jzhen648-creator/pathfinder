/**
 * Deletes every Goal (roadmap tree nodes) and GoalEvaluationCache row.
 * Milestones and subtasks cascade from Goal per Prisma schema.
 *
 * Run: npm run clear-goals
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const caches = await prisma.goalEvaluationCache.deleteMany({});
  const goals = await prisma.goal.deleteMany({});
  console.log(`Deleted ${goals.count} goals and ${caches.count} goal evaluation cache rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
