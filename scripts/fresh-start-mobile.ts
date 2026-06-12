/**
 * Mobile testing fresh start:
 * - Deletes every account except --keep-email (default: dev login email)
 * - Wipes all map/AI/legacy data on the kept account
 * - Resets mobile onboarding; re-syncs taxonomy sections (no mock seed)
 *
 * Run:
 *   npm run fresh-start:mobile
 *   npx tsx scripts/fresh-start-mobile.ts --dry-run
 *   npx tsx scripts/fresh-start-mobile.ts --delete-all --dry-run
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { resolveDevLoginEmail } from "../src/lib/dev-login-credentials";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const deleteAll = argv.includes("--delete-all");
  const emailEq = argv.find((a) => a.startsWith("--keep-email="))?.split("=")[1];
  const idx = argv.indexOf("--keep-email");
  const emailFlag = idx >= 0 ? argv[idx + 1] : undefined;
  const keepEmail = deleteAll ? null : (emailEq ?? emailFlag ?? resolveDevLoginEmail());
  return { dryRun, deleteAll, keepEmail };
}

async function wipeUserContent(userId: string, dryRun: boolean): Promise<void> {
  const streamSession = getStreamSessionDelegate(prisma);

  if (dryRun) {
    const [
      goals,
      marks,
      streamRuns,
      streamSessions,
      memory,
      memoryHist,
      insight,
      story,
      facts,
      manual,
      trunkSeg,
      trunkEnt,
      evalCache,
      reframes,
    ] = await Promise.all([
      prisma.goal.count({ where: { userId } }),
      prisma.mark.count({ where: { userId } }),
      prisma.streamRun.count({ where: { userId } }),
      streamSession ? streamSession.count({ where: { userId } }) : Promise.resolve(0),
      prisma.userMemory.count({ where: { userId } }),
      prisma.userMemoryHistory.count({ where: { userId } }),
      prisma.insightCache.count({ where: { userId } }),
      prisma.storyCache.count({ where: { userId } }),
      prisma.profileFact.count({ where: { userId } }),
      prisma.userManualProfile.count({ where: { userId } }),
      prisma.trunkSegment.count({ where: { userId } }),
      prisma.trunkEntry.count({ where: { userId } }),
      prisma.goalEvaluationCache.count({ where: { userId } }),
      prisma.reframe.count({ where: { mark: { userId } } }),
    ]);
    console.log(`  would delete: goals=${goals} marks=${marks} streamRuns=${streamRuns} streamSessions=${streamSessions}`);
    console.log(`  would delete: userMemory=${memory}+${memoryHist} caches=${insight + story} profileFacts=${facts} manualProfile=${manual}`);
    console.log(`  would delete: trunk=${trunkSeg}+${trunkEnt} evalCache=${evalCache} reframes=${reframes}`);
    return;
  }

  await prisma.reframe.deleteMany({ where: { mark: { userId } } });
  await prisma.goalEvaluationCache.deleteMany({ where: { userId } });
  await prisma.streamRun.deleteMany({ where: { userId } });
  if (streamSession) {
    await streamSession.deleteMany({ where: { userId } });
  }
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.mark.deleteMany({ where: { userId } });
  await prisma.userMemoryHistory.deleteMany({ where: { userId } });
  await prisma.userMemory.deleteMany({ where: { userId } });
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.storyCache.deleteMany({ where: { userId } });
  await prisma.profileFact.deleteMany({ where: { userId } });
  await prisma.userManualProfile.deleteMany({ where: { userId } });
  await prisma.trunkEntry.deleteMany({ where: { userId } });
  await prisma.trunkSegment.deleteMany({ where: { userId } });
  await prisma.themeCategory.deleteMany({ where: { userId, isSystemCategory: false } });
  await prisma.themeCategory.updateMany({
    where: { userId, isSystemCategory: true },
    data: { isActive: false },
  });
}

async function resetUserForMobileOnboarding(userId: string, dryRun: boolean): Promise<void> {
  const data = {
    onboardingCompleted: false,
    firstRunCompleted: false,
    onboardingScene: null,
    onboardingThemeId: null,
    onboardingHubSlug: null,
    onboardingPrimaryLimbId: null,
    unlockedLimbIds: Prisma.JsonNull,
    onboardingProfileText: null,
    onboardingProfileData: Prisma.JsonNull,
    careerEducationContextText: null,
    lifeWheelRatings: Prisma.JsonNull,
    lifeWheelHistory: Prisma.JsonNull,
    lifeWheelAchievementAt: null,
    taxonomyVersion: null,
    taxonomySyncedAt: null,
  };

  if (dryRun) {
    console.log("  would reset onboarding + profile JSON fields on kept user");
    return;
  }

  await prisma.user.update({ where: { id: userId }, data });
  await ensureTaxonomyCurrent(prisma, userId);
}

async function main() {
  const { dryRun, deleteAll, keepEmail } = parseArgs(process.argv.slice(2));

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  if (users.length === 0) {
    console.log("No users in database.");
    return;
  }

  console.log(`Fresh start (mobile)${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`Accounts in DB: ${users.length}`);
  for (const u of users) {
    console.log(`  - ${u.email}`);
  }

  if (deleteAll) {
    console.log("\nMode: DELETE ALL accounts (including dev — re-register in mobile app after).");
    if (dryRun) {
      console.log(`Would delete ${users.length} user row(s).`);
      return;
    }
    const deleted = await prisma.user.deleteMany({});
    console.log(`\nDeleted ${deleted.count} user row(s). Register fresh in the mobile app.`);
    return;
  }

  if (!keepEmail) {
    console.error("No keep email resolved.");
    process.exitCode = 1;
    return;
  }

  const keepUser = users.find((u) => u.email === keepEmail);
  const deleteUsers = users.filter((u) => u.email !== keepEmail);

  console.log(`\nKeep: ${keepEmail}${keepUser ? "" : " (will be created on next mobile register if missing)"}`);
  console.log(`Delete ${deleteUsers.length} other account(s):`);
  for (const u of deleteUsers) {
    console.log(`  - ${u.email}`);
  }

  if (dryRun) {
    if (keepUser) {
      console.log(`\nWipe content for ${keepEmail}:`);
      await wipeUserContent(keepUser.id, true);
      await resetUserForMobileOnboarding(keepUser.id, true);
    }
    console.log(`\nWould delete ${deleteUsers.length} user row(s).`);
    return;
  }

  for (const u of deleteUsers) {
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`Deleted account: ${u.email}`);
  }

  if (!keepUser) {
    console.log(`\nKept email not found — no wipe target. Register ${keepEmail} in the mobile app.`);
    return;
  }

  console.log(`\nWiping content for ${keepEmail}…`);
  await wipeUserContent(keepUser.id, false);
  await resetUserForMobileOnboarding(keepUser.id, false);

  const [goals, marks, branches, profile] = await Promise.all([
    prisma.goal.count({ where: { userId: keepUser.id } }),
    prisma.mark.count({ where: { userId: keepUser.id } }),
    prisma.themeCategory.count({ where: { userId: keepUser.id } }),
    prisma.userManualProfile.count({ where: { userId: keepUser.id } }),
  ]);

  console.log("\nDone. Kept account state:");
  console.log(`  email: ${keepEmail}`);
  console.log(`  onboardingCompleted: false`);
  console.log(`  goals: ${goals}, marks: ${marks}, sections: ${branches}, manualProfile: ${profile}`);
  console.log("\nNext: log out in mobile → log back in → complete onboarding from scratch.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
