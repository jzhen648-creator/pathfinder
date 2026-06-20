/**
 * Legacy / desktop-era data audit — row counts by cleanup tier.
 *
 * Read-only. Use before backfills or prod deletes.
 *
 * Run:
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
  const now = new Date();

  const [
    trunkSegments,
    trunkEntries,
    userMemory,
    userMemoryHistory,
    goalEvaluationCache,
    reframes,
    dailyTasks,
    checkpoints,
    streamSessions,
    streamRunsTotal,
    streamRunsExpired,
    insightCache,
    storyCache,
    profileFacts,
    manualProfile,
    goalsActive,
    goalsArchived,
    goalsMomentEvent,
    goalsPractice,
    goalsNested,
    goalsMissingHex,
    goalsMissingShortLabel,
    marksActive,
    marksArchived,
    marksNeedsResolution,
    branchesSystem,
    branchesCustom,
    branchesNested,
    branchesCustomWithRefs,
    milestones,
    subtasks,
    userDesktopFields,
  ] = await Promise.all([
    prisma.trunkSegment.count({ where: { userId } }),
    prisma.trunkEntry.count({ where: { userId } }),
    prisma.userMemory.count({ where: { userId } }),
    prisma.userMemoryHistory.count({ where: { userId } }),
    prisma.goalEvaluationCache.count({ where: { userId } }),
    prisma.reframe.count({ where: { mark: { userId } } }),
    prisma.dailyTask.count({ where: { quickWin: { milestone: { goal: { userId } } } } }),
    prisma.checkpoint.count({ where: { quickWin: { milestone: { goal: { userId } } } } }),
    prisma.streamSession.count({ where: { userId } }),
    prisma.streamRun.count({ where: { userId } }),
    prisma.streamRun.count({ where: { userId, expiresAt: { lt: now } } }),
    prisma.insightCache.count({ where: { userId } }),
    prisma.storyCache.count({ where: { userId } }),
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
    prisma.mark.count({ where: { userId, archived: false } }),
    prisma.mark.count({ where: { userId, archived: true } }),
    prisma.mark.count({ where: { userId, archived: false, needsResolution: true } }),
    prisma.themeCategory.count({ where: { userId, isSystemCategory: true } }),
    prisma.themeCategory.count({ where: { userId, isSystemCategory: false } }),
    prisma.themeCategory.count({ where: { userId, parentCategoryId: { not: null } } }),
    prisma.themeCategory.count({
      where: {
        userId,
        isSystemCategory: false,
        OR: [
          { goals: { some: {} } },
          { marks: { some: {} } },
        ],
      },
    }),
    prisma.milestone.count({ where: { goal: { userId, archived: false } } }),
    prisma.subtask.count({ where: { milestone: { goal: { userId, archived: false } } } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        taxonomyVersion: true,
        onboardingScene: true,
        onboardingHubSlug: true,
        onboardingProfileText: true,
        careerEducationContextText: true,
        lifeWheelRatings: true,
      },
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
      milestones: milestones,
      manual_profile: manualProfile,
      profile_facts: profileFacts,
      user_memory: userMemory,
    },
    "Do not delete",
  );

  printTier(
    "TIER 1 — safe to delete (zero mobile impact)",
    {
      marks_active: marksActive,
      marks_archived: marksArchived,
      unresolved_marks: marksNeedsResolution,
      trunk_segments: trunkSegments,
      trunk_entries: trunkEntries,
      user_memory_history: userMemoryHistory,
      goal_evaluation_cache: goalEvaluationCache,
      reframes: reframes,
      daily_tasks: dailyTasks,
      checkpoints: checkpoints,
      subtasks: subtasks,
    },
    "Retired desktop tables — npm run purge:legacy-desktop-data",
  );

  printTier(
    "TIER 2 — normalize via backfill (keep rows, fix shape)",
    {
      nested_parentGoalId: goalsNested,
      goalType_practice: goalsPractice,
      missing_shortLabel: goalsMissingShortLabel,
      missing_mapGrid: goalsMissingHex,
    },
    "Run backfill:* scripts in pathfinder/package.json",
  );

  printTier(
    "TIER 3 — optional delete (data loss if you proceed)",
    {
      moment_event_goals: goalsMomentEvent,
      archived_goals: goalsArchived,
      custom_branches: branchesCustom,
      custom_branches_with_refs: branchesCustomWithRefs,
      nested_branch_rows: branchesNested,
      stream_sessions: streamSessions,
      stream_runs_total: streamRunsTotal,
      stream_runs_expired: streamRunsExpired,
      story_cache: storyCache,
    },
    "Review samples before deleting custom branches; purge script handles archived/moment/practice goals",
  );

  const desktopFieldCount = [
    userDesktopFields?.onboardingScene != null,
    Boolean(userDesktopFields?.onboardingHubSlug),
    Boolean(userDesktopFields?.onboardingProfileText),
    Boolean(userDesktopFields?.careerEducationContextText),
    userDesktopFields?.lifeWheelRatings != null,
  ].filter(Boolean).length;

  printTier(
    "User metadata (desktop onboarding — safe to null, not delete user)",
    {
      hub_taxonomy_version: userDesktopFields?.taxonomyVersion ? 1 : 0,
      desktop_onboarding_fields_set: desktopFieldCount,
    },
  );

  if (goalsMomentEvent > 0) {
    const samples = await prisma.goal.findMany({
      where: { userId, archived: false, goalType: { in: ["moment", "event"] } },
      select: { id: true, title: true, goalType: true, categoryId: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    console.log("\n  moment/event goal samples (migrate to Mark before delete):");
    for (const g of samples) {
      console.log(`    - [${g.goalType}] ${g.title.slice(0, 60)} (${g.id.slice(0, 10)}…)`);
    }
  }

  if (goalsNested > 0) {
    const samples = await prisma.goal.findMany({
      where: { userId, archived: false, parentGoalId: { not: null } },
      select: { id: true, title: true, parentGoalId: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    console.log("\n  nested pursuit samples (backfill:flatten-goal-lineage clears parentGoalId):");
    for (const g of samples) {
      console.log(`    - ${g.title.slice(0, 50)} → parent ${g.parentGoalId?.slice(0, 10)}…`);
    }
  }

  const tier1Total =
    marksActive +
    marksArchived +
    trunkSegments +
    trunkEntries +
    userMemoryHistory +
    goalEvaluationCache +
    reframes +
    dailyTasks +
    checkpoints +
    subtasks;

  const tier3Deletable =
    goalsMomentEvent +
    goalsArchived +
    streamSessions +
    streamRunsExpired +
    storyCache;

  return {
    email,
    tier1Total,
    tier2Nested: goalsNested,
    tier2Practice: goalsPractice,
    tier3Deletable,
    pursuitsActive,
    marksActive,
  };
}

async function main() {
  const users = await prisma.user.findMany({
    where: filterEmail ? { email: filterEmail } : undefined,
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  if (users.length === 0) {
    console.error(filterEmail ? `No user found for email: ${filterEmail}` : "No users in database");
    process.exitCode = 1;
    return;
  }

  console.log("Legacy data audit (read-only)");
  console.log(`Users: ${users.length}${filterEmail ? ` (${filterEmail})` : ""}`);
  console.log("\nTiers:");
  console.log("  KEEP     — mobile depends on these");
  console.log("  TIER 1   — safe to delete (desktop-only tables)");
  console.log("  TIER 2   — run backfills (flatten lineage, practice, short labels, …)");
  console.log("  TIER 3   — optional delete after review");

  const summaries = [];
  for (const user of users) {
    summaries.push(await auditUser(user.id, user.email));
  }

  if (summaries.length > 1) {
    console.log(`\n${"=".repeat(72)}`);
    console.log("  ALL USERS SUMMARY");
    console.log(`${"=".repeat(72)}`);
    console.log("Email                              T1    T2nest  T2prac  T3~del  Pursuits  Marks");
    console.log("---------------------------------  ----  ------  ------  ------  --------  -----");
    for (const s of summaries) {
      console.log(
        `${s.email.padEnd(33)}  ${String(s.tier1Total).padStart(4)}  ${String(s.tier2Nested).padStart(6)}  ${String(s.tier2Practice).padStart(6)}  ${String(s.tier3Deletable).padStart(6)}  ${String(s.pursuitsActive).padStart(8)}  ${String(s.marksActive).padStart(5)}`,
      );
    }
  }

  console.log("\nSuggested next steps:");
  console.log("  npm run purge:legacy-desktop-data -- --dry-run");
  console.log("  npm run purge:legacy-desktop-data");
  console.log("  npm run backfill:flatten-goal-lineage");
  console.log("  npm run backfill:short-labels");
  console.log("  npm run audit:legacy-data -- --email <you>");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
