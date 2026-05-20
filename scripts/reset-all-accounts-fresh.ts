/**
 * Wipes tree-related data for every user, then:
 * - Re-seeds fulltree@ / mygoals@ / jeremy@pathfinder.test (password123) via seed:tree fixtures
 * - Applies locked 17-hub taxonomy (no goals/marks) for all other accounts
 *
 * Run: npm run reset:all-accounts
 */
import { PrismaClient } from "@prisma/client";
import { syncHubTaxonomyForUser } from "../src/lib/hub-taxonomy-sync";
import { seedAllTreeTestProfiles } from "../src/lib/tree-test-profiles-seed";

const DEMO_TREE_EMAILS = new Set([
  "fulltree@pathfinder.test",
  "mygoals@pathfinder.test",
  "jeremy@pathfinder.test",
]);

async function wipeUserTreeData(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.goalEvaluationCache.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.mark.deleteMany({ where: { userId } });
  await prisma.branch.deleteMany({ where: { userId, isSystemHub: false } });
  await prisma.branch.updateMany({
    where: { userId, isSystemHub: true },
    data: { isActive: false },
  });
  await prisma.trunkEntry.deleteMany({ where: { userId } });
  await prisma.trunkSegment.deleteMany({ where: { userId } });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });

    if (users.length === 0) {
      console.log("No users in database.");
      return;
    }

    console.log(`Resetting tree data for ${users.length} user(s)…\n`);

    for (const user of users) {
      await wipeUserTreeData(prisma, user.id);
      console.log(`  wiped  ${user.email}`);
    }

    console.log("\nRe-seeding demo tree profiles…");
    await seedAllTreeTestProfiles(prisma);

    console.log("\nApplying fresh hub taxonomy for non-demo accounts…");
    for (const user of users) {
      if (DEMO_TREE_EMAILS.has(user.email)) continue;
      await syncHubTaxonomyForUser(prisma, user.id);
      console.log(`  hubs   ${user.email}`);
    }

    console.log("\nDone. Demo logins: fulltree@ / mygoals@ / jeremy@pathfinder.test — password123");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
