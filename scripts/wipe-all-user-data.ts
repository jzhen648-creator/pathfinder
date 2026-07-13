/**
 * 1. Wipes goals, milestones, and non-system categories.
 *    Preserves system category rows (isSystemCategory) and resets them to dormant.
 * 2. Optionally deletes demo/test accounts.
 *
 * Run: npm run wipe:all-user-data
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { ensureSystemCategoriesForUser } from "../src/lib/system-categories";

const KEEP_EMAIL = "jzhen648@gmail.com";

const EMAILS_TO_DELETE = [
  "fulltree@pathfinder.test",
  "alex.carter@pathfinder.test",
  "jeremy@pathfinder.test",
  "roadmap-demo@pathfinder.com",
  "test-sparse@pathfinder.com",
  "test-empty@pathfinder.com",
] as const;

const prisma = new PrismaClient();

async function wipeAllUserData(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    console.log("No users in database.");
    return;
  }

  console.log(`Step 1: Wiping user content for ${users.length} account(s)…\n`);

  const goals = await prisma.goal.deleteMany({});
  const customBranches = await prisma.themeCategory.deleteMany({ where: { isSystemCategory: false } });

  const hubReset = await prisma.themeCategory.updateMany({
    where: { isSystemCategory: true },
    data: { isActive: false },
  });

  const profileReset = await prisma.user.updateMany({
    data: {
      onboardingCompleted: false,
      onboardingThemeId: null,
      unlockedLimbIds: Prisma.JsonNull,
    },
  });

  console.log("Deleted:");
  console.log(`  goals (+ milestones):  ${goals.count}`);
  console.log(`  custom categories:     ${customBranches.count}`);
  console.log(`\nReset ${hubReset.count} system categor(ies) to dormant.`);
  console.log(`Cleared profile/onboarding on ${profileReset.count} user(s).`);

  console.log("\nEnsuring system categories per user…");
  for (const user of users) {
    const created = await ensureSystemCategoriesForUser(prisma, user.id);
    if (created > 0) console.log(`  ${user.email}: created ${created} categor(ies)`);
  }
}

async function deleteDemoAccounts(): Promise<void> {
  console.log(`\nStep 2: Deleting demo/test accounts (keeping ${KEEP_EMAIL})…\n`);

  const deleted = await prisma.user.deleteMany({
    where: { email: { in: [...EMAILS_TO_DELETE] } },
  });

  console.log(`Deleted ${deleted.count} user row(s).`);
}

async function main() {
  await wipeAllUserData();
  await deleteDemoAccounts();
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
