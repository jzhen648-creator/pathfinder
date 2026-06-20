/**
 * Purge retired desktop-era data while keeping mobile live rows:
 * pursuits, milestones, relationships, context log, manual profile, user memory, insight cache.
 *
 * Deletes: marks, stream, trunk, story cache, subtasks, archived/moment goals,
 * stream-sourced profile facts, stream_digest context entries, goal evaluation cache.
 * Clears: desktop User JSON fields, category hub metrics, goal roadmapJson / stream FKs.
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
  const now = new Date();
  const [
    marks,
    reframes,
    streamRuns,
    streamSessions,
    trunkSegments,
    trunkEntries,
    storyCache,
    evalCache,
    subtasks,
    dailyTasks,
    checkpoints,
    archivedGoals,
    momentGoals,
    practiceGoals,
    streamFacts,
    streamDigestEntries,
    dirtyMarkHub,
    goalsWithRoadmap,
  ] = await Promise.all([
    prisma.mark.count({ where: { userId } }),
    prisma.reframe.count({ where: { mark: { userId } } }),
    prisma.streamRun.count({ where: { userId } }),
    prisma.streamSession.count({ where: { userId } }),
    prisma.trunkSegment.count({ where: { userId } }),
    prisma.trunkEntry.count({ where: { userId } }),
    prisma.storyCache.count({ where: { userId } }),
    prisma.goalEvaluationCache.count({ where: { userId } }),
    prisma.subtask.count({ where: { milestone: { goal: { userId } } } }),
    prisma.dailyTask.count({ where: { quickWin: { milestone: { goal: { userId } } } } }),
    prisma.checkpoint.count({ where: { quickWin: { milestone: { goal: { userId } } } } }),
    prisma.goal.count({ where: { userId, archived: true } }),
    prisma.goal.count({ where: { userId, archived: false, goalType: { in: ["moment", "event"] } } }),
    prisma.goal.count({ where: { userId, archived: false, goalType: "practice" } }),
    prisma.profileFact.count({ where: { userId, source: "stream_extracted" } }),
    prisma.pursuitContextEntry.count({ where: { userId, kind: "stream_digest" } }),
    prisma.aiReadingDirtyItem.count({
      where: { userId, entityType: { in: ["mark", "hub"] } },
    }),
    prisma.goal.count({ where: { userId, roadmapJson: { not: Prisma.DbNull } } }),
  ]);

  return {
    marks,
    reframes,
    streamRuns,
    streamSessions,
    trunkSegments,
    trunkEntries,
    storyCache,
    evalCache,
    subtasks,
    dailyTasks,
    checkpoints,
    legacyGoals: archivedGoals + momentGoals + practiceGoals,
    streamFacts,
    streamDigestEntries,
    dirtyMarkHub,
    goalsWithRoadmap,
    streamRunsExpired: await prisma.streamRun.count({
      where: { userId, expiresAt: { lt: now } },
    }),
  };
}

async function purgeUser(user: UserScope, dryRun: boolean): Promise<void> {
  const before = await countLegacy(user.id);
  console.log(`\n${user.email}`);
  console.log(
    `  legacy rows: marks=${before.marks} stream=${before.streamRuns}+${before.streamSessions} trunk=${before.trunkSegments}+${before.trunkEntries} story=${before.storyCache}`,
  );
  console.log(
    `  legacy rows: subtasks=${before.subtasks} legacyGoals=${before.legacyGoals} streamFacts=${before.streamFacts} streamDigest=${before.streamDigestEntries}`,
  );

  if (dryRun) {
    console.log("  [dry-run] no changes written");
    return;
  }

  await prisma.reframe.deleteMany({ where: { mark: { userId: user.id } } });
  await prisma.aiReadingDirtyItem.deleteMany({
    where: { userId: user.id, entityType: { in: ["mark", "hub"] } },
  });

  await prisma.goal.updateMany({
    where: { userId: user.id },
    data: { sourceStreamRunId: null, roadmapJson: Prisma.JsonNull },
  });
  await prisma.milestone.updateMany({
    where: { goal: { userId: user.id } },
    data: { sourceStreamRunId: null },
  });

  await prisma.mark.deleteMany({ where: { userId: user.id } });
  await prisma.streamRun.deleteMany({ where: { userId: user.id } });
  await prisma.streamSession.deleteMany({ where: { userId: user.id } });

  await prisma.checkpoint.deleteMany({
    where: { quickWin: { milestone: { goal: { userId: user.id } } } },
  });
  await prisma.dailyTask.deleteMany({
    where: { quickWin: { milestone: { goal: { userId: user.id } } } },
  });
  await prisma.subtask.deleteMany({
    where: { milestone: { goal: { userId: user.id } } },
  });

  await prisma.trunkEntry.deleteMany({ where: { userId: user.id } });
  await prisma.trunkSegment.deleteMany({ where: { userId: user.id } });
  await prisma.storyCache.deleteMany({ where: { userId: user.id } });
  await prisma.goalEvaluationCache.deleteMany({ where: { userId: user.id } });

  await prisma.profileFact.deleteMany({
    where: { userId: user.id, source: "stream_extracted" },
  });

  const digestGoals = await prisma.pursuitContextEntry.findMany({
    where: { userId: user.id, kind: "stream_digest" },
    select: { goalId: true },
    distinct: ["goalId"],
  });
  await prisma.pursuitContextEntry.deleteMany({
    where: { userId: user.id, kind: "stream_digest" },
  });
  for (const row of digestGoals) {
    await syncGoalDescriptionFromLog(row.goalId);
  }

  await prisma.goal.deleteMany({
    where: {
      userId: user.id,
      OR: [
        { archived: true },
        { goalType: { in: ["moment", "event", "practice"] } },
      ],
    },
  });

  await prisma.goal.updateMany({
    where: { userId: user.id, parentGoalId: { not: null } },
    data: { parentGoalId: null },
  });

  await prisma.themeCategory.updateMany({
    where: { userId: user.id },
    data: {
      goal: null,
      goalValue: null,
      currentValue: null,
      unit: null,
      name: null,
      parentCategoryId: null,
      turningPointId: null,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      onboardingScene: null,
      onboardingHubSlug: null,
      onboardingPrimaryLimbId: null,
      firstRunCompleted: false,
      unlockedLimbIds: Prisma.JsonNull,
      onboardingProfileText: null,
      onboardingProfileData: Prisma.JsonNull,
      careerEducationContextText: null,
      lifeWheelRatings: Prisma.JsonNull,
      lifeWheelHistory: Prisma.JsonNull,
      lifeWheelAchievementAt: null,
    },
  });

  const after = await countLegacy(user.id);
  console.log(
    `  purged → marks=${after.marks} stream=${after.streamRuns} trunk=${after.trunkEntries} story=${after.storyCache} legacyGoals=${after.legacyGoals}`,
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
