/**
 * Delete every user except the pinned dev account, then reset that account for fresh onboarding.
 * Run: npx tsx scripts/fresh-start-keep-dev.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { resolveDevLoginEmail } from "../src/lib/dev-login-credentials";
import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";
import { ensureSystemHubsForUser } from "../src/lib/system-hubs";

const prisma = new PrismaClient();

async function wipeUserContent(userId: string): Promise<void> {
  await prisma.goalEvaluationCache.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.mark.deleteMany({ where: { userId } });
  await prisma.themeCategory.deleteMany({ where: { userId, isSystemHub: false } });
  await prisma.themeCategory.updateMany({
    where: { userId, isSystemHub: true },
    data: { isActive: false },
  });
  await prisma.trunkEntry.deleteMany({ where: { userId } });
  await prisma.trunkSegment.deleteMany({ where: { userId } });

  const streamSession = getStreamSessionDelegate(prisma);
  if (streamSession) {
    await streamSession.deleteMany({ where: { userId } });
  }
}

async function resetDevProfile(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: false,
      firstRunCompleted: false,
      onboardingScene: 1,
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
      hubTaxonomyVersion: null,
      hubTaxonomySyncedAt: null,
    },
  });
}

async function main() {
  const keepEmail = resolveDevLoginEmail();

  const keepUser = await prisma.user.findUnique({
    where: { email: keepEmail },
    select: { id: true, email: true },
  });

  if (!keepUser) {
    console.error(`No user found for pinned dev account: ${keepEmail}`);
    console.error("Register that account first, then re-run this script.");
    process.exitCode = 1;
    return;
  }

  const deleted = await prisma.user.deleteMany({
    where: { email: { not: keepEmail } },
  });

  console.log(`Deleted ${deleted.count} other account(s). Keeping ${keepEmail}.\n`);

  await wipeUserContent(keepUser.id);
  await resetDevProfile(keepUser.id);
  const hubsCreated = await ensureSystemHubsForUser(prisma, keepUser.id);

  const counts = await Promise.all([
    prisma.themeCategory.count({ where: { userId: keepUser.id } }),
    prisma.mark.count({ where: { userId: keepUser.id } }),
    prisma.goal.count({ where: { userId: keepUser.id } }),
  ]);

  console.log("Dev account reset for fresh onboarding:");
  console.log(`  onboardingCompleted: false`);
  console.log(`  onboardingScene: 1`);
  console.log(`  system hubs: ${counts[0]} (${hubsCreated} created this run)`);
  console.log(`  marks: ${counts[1]}, goals: ${counts[2]}`);
  console.log(`\nLog out and back in (or hard-refresh), then visit /tree.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
