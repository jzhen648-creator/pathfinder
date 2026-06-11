/**
 * 1. Wipes goals, marks, milestones, reframes, and non-system branches.
 *    Preserves system hub rows (isSystemCategory) and resets them to dormant.
 * 2. Optionally deletes demo/test accounts.
 *
 * Run: npm run wipe:all-user-data
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { ensureSystemCategoriesForUser } from "../src/lib/system-hubs";

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

  const reframes = await prisma.reframe.deleteMany({});
  const marks = await prisma.mark.deleteMany({});
  const caches = await prisma.goalEvaluationCache.deleteMany({});
  const goals = await prisma.goal.deleteMany({});
  const customBranches = await prisma.themeCategory.deleteMany({ where: { isSystemCategory: false } });
  const trunkEntries = await prisma.trunkEntry.deleteMany({});
  const trunkSegments = await prisma.trunkSegment.deleteMany({});

  const hubReset = await prisma.themeCategory.updateMany({
    where: { isSystemCategory: true },
    data: { isActive: false },
  });

  const profileReset = await prisma.user.updateMany({
    data: {
      onboardingCompleted: false,
      firstRunCompleted: false,
      onboardingPrimaryLimbId: null,
      onboardingProfileText: null,
      onboardingProfileData: Prisma.JsonNull,
      careerEducationContextText: null,
      lifeWheelRatings: Prisma.JsonNull,
      lifeWheelHistory: Prisma.JsonNull,
      lifeWheelAchievementAt: null,
    },
  });

  console.log("Deleted:");
  console.log(`  reframes:              ${reframes.count}`);
  console.log(`  marks:                 ${marks.count}`);
  console.log(`  goal evaluation cache: ${caches.count}`);
  console.log(`  goals (+ milestones):  ${goals.count}`);
  console.log(`  custom branches:       ${customBranches.count}`);
  console.log(`  trunk entries:         ${trunkEntries.count}`);
  console.log(`  trunk segments:        ${trunkSegments.count}`);
  console.log(`\nReset ${hubReset.count} system hub(s) to dormant.`);
  console.log(`Cleared profile/onboarding on ${profileReset.count} user(s).`);

  console.log("\nEnsuring 17 system hubs per user…");
  for (const user of users) {
    const created = await ensureSystemCategoriesForUser(prisma, user.id);
    if (created > 0) console.log(`  ${user.email}: created ${created} hub(s)`);
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
