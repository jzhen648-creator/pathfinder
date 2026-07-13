/**
 * Wipes map-related data for every user, then re-syncs locked taxonomy (no pursuits/marks).
 *
 * Run: npm run reset:all-accounts
 */
import { PrismaClient } from "@prisma/client";
import { syncTaxonomyForUser } from "../src/lib/taxonomy-sync";

async function wipeUserTreeData(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.themeCategory.deleteMany({ where: { userId, isSystemCategory: false } });
  await prisma.themeCategory.updateMany({
    where: { userId, isSystemCategory: true },
    data: { isActive: false },
  });
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

    console.log(`Resetting map data for ${users.length} user(s)…\n`);

    for (const user of users) {
      await wipeUserTreeData(prisma, user.id);
      console.log(`  wiped  ${user.email}`);
    }

    console.log("\nApplying fresh hub taxonomy for all accounts…");
    for (const user of users) {
      await syncTaxonomyForUser(prisma, user.id);
      console.log(`  hubs   ${user.email}`);
    }

    console.log("\nDone. Accounts have taxonomy only — add pursuits from the mobile app.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
