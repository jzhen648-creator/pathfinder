/**
 * Purge legacy goal shapes and optional desktop-era user metadata while keeping
 * mobile live rows: pursuits, milestones, relationships, context log, profile, memory.
 *
 * Run:
 *   npm run purge:legacy-desktop-data -- --dry-run
 *   npm run purge:legacy-desktop-data
 *   npx tsx scripts/purge-legacy-desktop-data.ts --email you@example.com
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { syncGoalDescriptionFromLog } from "../src/lib/pursuit/pursuit-context-log";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const emailEq = argv.find((a) => a.startsWith("--email="))?.split("=")[1];
  const idx = argv.indexOf("--email");
  const emailFromFlag = idx >= 0 ? argv[idx + 1] : undefined;
  const email = emailEq ?? emailFromFlag;
  return { dryRun, email };
}

type UserScope = { id: string; email: string };

async function resolveUsers(email?: string): Promise<UserScope[]> {
  const users = await prisma.user.findMany({
    where: email ? { email } : undefined,
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
  if (users.length === 0) {
    throw new Error(email ? `No user found for email: ${email}` : "No users in database");
  }
  return users;
}

async function countLegacy(userId: string) {
  const [archivedGoals, momentGoals, practiceGoals, nestedGoals, customBranches, dirtyItems] =
    await Promise.all([
      prisma.goal.count({ where: { userId, archived: true } }),
      prisma.goal.count({ where: { userId, archived: false, goalType: { in: ["moment", "event"] } } }),
      prisma.goal.count({ where: { userId, archived: false, goalType: "practice" } }),
      prisma.goal.count({ where: { userId, archived: false, parentGoalId: { not: null } } }),
      prisma.themeCategory.count({ where: { userId, isSystemCategory: false } }),
      prisma.aiReadingDirtyItem.count({ where: { userId } }),
    ]);

  return {
    legacyGoals: archivedGoals + momentGoals + practiceGoals,
    nestedGoals,
    customBranches,
    dirtyItems,
  };
}

async function purgeUser(user: UserScope, dryRun: boolean): Promise<void> {
  const before = await countLegacy(user.id);
  console.log(`\n${user.email}`);
  console.log(
    `  legacy rows: legacyGoals=${before.legacyGoals} nested=${before.nestedGoals} customBranches=${before.customBranches} dirty=${before.dirtyItems}`,
  );

  if (dryRun) {
    console.log("  [dry-run] no changes written");
    return;
  }

  await prisma.goal.updateMany({
    where: { userId: user.id, parentGoalId: { not: null } },
    data: { parentGoalId: null },
  });

  const digestGoals = await prisma.pursuitContextEntry.findMany({
    where: { userId: user.id, kind: "ai_merge" },
    select: { goalId: true },
    distinct: ["goalId"],
  });

  await prisma.goal.deleteMany({
    where: {
      userId: user.id,
      OR: [{ archived: true }, { goalType: { in: ["moment", "event", "practice"] } }],
    },
  });

  for (const row of digestGoals) {
    await syncGoalDescriptionFromLog(row.goalId);
  }

  const orphanCustom = await prisma.themeCategory.findMany({
    where: {
      userId: user.id,
      isSystemCategory: false,
      goals: { none: {} },
    },
    select: { id: true },
  });
  if (orphanCustom.length > 0) {
    await prisma.themeCategory.deleteMany({
      where: { id: { in: orphanCustom.map((row) => row.id) } },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      onboardingThemeId: null,
      unlockedLimbIds: Prisma.JsonNull,
    },
  });

  const after = await countLegacy(user.id);
  console.log(
    `  purged → legacyGoals=${after.legacyGoals} nested=${after.nestedGoals} customBranches=${after.customBranches}`,
  );
}

async function main() {
  const { dryRun, email } = parseArgs(process.argv.slice(2));
  const users = await resolveUsers(email);

  console.log(`Purge legacy/desktop data${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`Users: ${users.length}${email ? ` (${email})` : " (all)"}`);

  for (const user of users) {
    await purgeUser(user, dryRun);
  }

  console.log("\nDone.");
  if (!dryRun) {
    console.log("Re-run: npm run audit:legacy-data");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
