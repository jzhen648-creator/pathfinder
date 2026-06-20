/**
 * Post-schema-cleanup data audit — row counts for mobile live data vs legacy shapes.
 *
 * Read-only. Run:
 *   npm run audit:legacy-data
 *   npx tsx scripts/audit-legacy-data.ts --email you@example.com
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const emailFlagIdx = process.argv.indexOf("--email");
const emailFromFlag =
  emailFlagIdx >= 0 && process.argv[emailFlagIdx + 1] ? process.argv[emailFlagIdx + 1] : undefined;
const filterEmail = emailArg ?? emailFromFlag ?? process.env.AUDIT_EMAIL;

type TierCounts = Record<string, number>;

function printTier(title: string, counts: TierCounts, note?: string) {
  console.log(`\n${title}`);
  if (note) console.log(`  (${note})`);
  const width = Math.max(...Object.keys(counts).map((k) => k.length), 8);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(width)}  ${value}`);
  }
}

async function auditUser(userId: string, email: string) {
  const [
    userMemory,
    userMemoryHistory,
    insightCache,
    profileFacts,
    manualProfile,
    goalsActive,
    goalsArchived,
    goalsMomentEvent,
    goalsPractice,
    goalsNested,
    goalsMissingHex,
    goalsMissingShortLabel,
    branchesSystem,
    branchesCustom,
    milestones,
    dirtyItems,
    relationships,
    contextEntries,
    userMeta,
  ] = await Promise.all([
    prisma.userMemory.count({ where: { userId } }),
    prisma.userMemoryHistory.count({ where: { userId } }),
    prisma.insightCache.count({ where: { userId } }),
    prisma.profileFact.count({ where: { userId } }),
    prisma.userManualProfile.count({ where: { userId } }),
    prisma.goal.count({ where: { userId, archived: false } }),
    prisma.goal.count({ where: { userId, archived: true } }),
    prisma.goal.count({ where: { userId, archived: false, goalType: { in: ["moment", "event"] } } }),
    prisma.goal.count({ where: { userId, archived: false, goalType: "practice" } }),
    prisma.goal.count({ where: { userId, archived: false, parentGoalId: { not: null } } }),
    prisma.goal.count({
      where: {
        userId,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
        OR: [{ mapGridQ: null }, { mapGridR: null }],
      },
    }),
    prisma.goal.count({
      where: {
        userId,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
        OR: [{ shortLabel: null }, { shortLabel: "" }],
      },
    }),
    prisma.themeCategory.count({ where: { userId, isSystemCategory: true } }),
    prisma.themeCategory.count({ where: { userId, isSystemCategory: false } }),
    prisma.milestone.count({ where: { goal: { userId, archived: false } } }),
    prisma.aiReadingDirtyItem.count({ where: { userId } }),
    prisma.pursuitRelationship.count({ where: { userId } }),
    prisma.pursuitContextEntry.count({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { taxonomyVersion: true, onboardingThemeId: true, onboardingCompleted: true },
    }),
  ]);

  const pursuitsActive = await prisma.goal.count({
    where: {
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
  });

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${email}`);
  console.log(`${"=".repeat(72)}`);

  printTier(
    "KEEP — mobile live data",
    {
      pursuits_active: pursuitsActive,
      system_sections: branchesSystem,
      milestones,
      manual_profile: manualProfile,
      profile_facts: profileFacts,
      user_memory: userMemory,
      relationships,
      context_entries: contextEntries,
    },
    "Do not delete",
  );

  printTier(
    "NORMALIZE — optional backfills",
    {
      nested_parentGoalId: goalsNested,
      goalType_practice: goalsPractice,
      missing_shortLabel: goalsMissingShortLabel,
      missing_mapGrid: goalsMissingHex,
    },
    "Run backfill:* scripts in pathfinder/package.json",
  );

  printTier(
    "OPTIONAL DELETE — review before purge",
    {
      moment_event_goals: goalsMomentEvent,
      archived_goals: goalsArchived,
      custom_branches: branchesCustom,
      user_memory_history: userMemoryHistory,
      dirty_reading_items: dirtyItems,
    },
    "npm run purge:legacy-desktop-data",
  );

  printTier("User metadata", {
    taxonomy_version: userMeta?.taxonomyVersion ? 1 : 0,
    onboarding_completed: userMeta?.onboardingCompleted ? 1 : 0,
    onboarding_theme_set: userMeta?.onboardingThemeId ? 1 : 0,
    insight_cache: insightCache,
  });
}

async function main() {
  const users = await prisma.user.findMany({
    where: filterEmail ? { email: filterEmail } : undefined,
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  if (users.length === 0) {
    throw new Error(filterEmail ? `No user found for email: ${filterEmail}` : "No users in database");
  }

  console.log(`Audit legacy/mobile data shape — ${users.length} user(s)`);
  for (const user of users) {
    await auditUser(user.id, user.email);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
