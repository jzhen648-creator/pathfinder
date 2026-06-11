/**
 * Reset one user for a fresh onboarding run.
 * Run: npx tsx scripts/reset-user-onboarding.ts [email]
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { ensureSystemHubsForUser } from "../src/lib/system-hubs";

const email = process.argv[2] ?? "jzhen648@gmail.com";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found: ${email}`);
    process.exitCode = 1;
    return;
  }

  await prisma.goalEvaluationCache.deleteMany({ where: { userId: user.id } });
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  await prisma.mark.deleteMany({ where: { userId: user.id } });
  await prisma.themeCategory.deleteMany({ where: { userId: user.id, isSystemHub: false } });
  await prisma.themeCategory.updateMany({
    where: { userId: user.id, isSystemHub: true },
    data: { isActive: false },
  });
  await prisma.trunkEntry.deleteMany({ where: { userId: user.id } });
  await prisma.trunkSegment.deleteMany({ where: { userId: user.id } });

  await prisma.user.update({
    where: { id: user.id },
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
    },
  });

  const created = await ensureSystemHubsForUser(prisma, user.id);
  const dormant = await prisma.themeCategory.count({
    where: { userId: user.id, isSystemHub: true, isActive: false },
  });

  console.log(`Reset complete for ${email}`);
  console.log(`  onboardingCompleted: false`);
  console.log(`  onboardingScene: 1`);
  console.log(`  system hubs dormant: ${dormant} (created ${created} this run)`);
  console.log(`\nLog out and back in, or hard-refresh, then visit /tree`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
