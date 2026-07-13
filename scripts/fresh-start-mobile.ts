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
  if (dryRun) {
    const [
      goals,
      memory,
      memoryHist,
      insight,
      facts,
      manual,
      dirtyItems,
    ] = await Promise.all([
      prisma.goal.count({ where: { userId } }),
      prisma.userMemory.count({ where: { userId } }),
      prisma.userMemoryHistory.count({ where: { userId } }),
      prisma.insightCache.count({ where: { userId } }),
      prisma.profileFact.count({ where: { userId } }),
      prisma.userManualProfile.count({ where: { userId } }),
      prisma.aiReadingDirtyItem.count({ where: { userId } }),
    ]);
    console.log(`  would delete: goals=${goals} userMemory=${memory}+${memoryHist} insightCache=${insight}`);
    console.log(`  would delete: profileFacts=${facts} manualProfile=${manual} dirtyLedger=${dirtyItems}`);
    return;
  }

  await prisma.aiReadingDirtyItem.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.userMemoryHistory.deleteMany({ where: { userId } });
  await prisma.userMemory.deleteMany({ where: { userId } });
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.profileFact.deleteMany({ where: { userId } });
  await prisma.userManualProfile.deleteMany({ where: { userId } });
  await prisma.themeCategory.deleteMany({ where: { userId, isSystemCategory: false } });
  await prisma.themeCategory.updateMany({
    where: { userId, isSystemCategory: true },
    data: { isActive: false },
  });
}

async function resetUserForMobileOnboarding(userId: string, dryRun: boolean): Promise<void> {
  const data = {
    onboardingCompleted: false,
    onboardingThemeId: null,
    unlockedLimbIds: Prisma.JsonNull,
    taxonomyVersion: null,
    taxonomySyncedAt: null,
    lastReadingDeliveredAt: null,
    lastFullReflectAt: null,
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

  const [goals, branches, profile] = await Promise.all([
    prisma.goal.count({ where: { userId: keepUser.id } }),
    prisma.themeCategory.count({ where: { userId: keepUser.id } }),
    prisma.userManualProfile.count({ where: { userId: keepUser.id } }),
  ]);

  console.log("\nDone. Kept account state:");
  console.log(`  email: ${keepEmail}`);
  console.log(`  onboardingCompleted: false`);
  console.log(`  goals: ${goals}, categories: ${branches}, manualProfile: ${profile}`);
  console.log("\nNext: log out in mobile → log back in → complete onboarding from scratch.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
