import { PrismaClient, type BloomStatus, type BranchStatus, type MarkSentiment, type MarkType } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Dev tree fixtures for `*.@pathfinder.test` (see GET /api/dev/mock-users).
 * Run: `npm run seed:tree`
 * - fulltree@pathfinder.test / password123 — showcase data
 * - mygoals@pathfinder.test / password123 — one starter thread per limb, no marks/goals (your canvas)
 */

const prisma = new PrismaClient();

type BranchSeed = {
  limbId: string;
  threadType: string;
  name: string;
  parentThreadType?: string;
  goal: string | null;
  goalValue: number | null;
  currentValue: number | null;
  unit: string | null;
  status: BranchStatus;
  bloomStatus: BloomStatus;
  createdAt: Date;
};

type MarkSeed = {
  branchThreadType: string;
  limbId: string;
  title: string;
  description: string;
  date: Date;
  year: number;
  type: MarkType;
  significance: number;
  sentiment: MarkSentiment;
  value: number | null;
  isTurningPoint: boolean;
  future: boolean;
  bloomStatus: "BLOOMED" | "GROWING" | "ENDED" | "BRANCHED" | "BUD";
};

type UserTreeSeed = {
  email: string;
  name: string;
  branchSeeds: BranchSeed[];
  markSeeds: MarkSeed[];
};

/**
 * Four root branches per limb (20 threads total), aligned with fork geometry — see AREA_FORKS_BASE &
 * THREAD_SLOTS.
 */
const branchSeedsFullTreeShowcase: BranchSeed[] = [
  { limbId: "finance", threadType: "Income", name: "Income", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-01-01") },
  { limbId: "finance", threadType: "Investing", name: "Investing", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2017-06-01") },
  { limbId: "finance", threadType: "Cash buffer", name: "Cash buffer", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-03-01") },
  { limbId: "finance", threadType: "Giving", name: "Giving", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-05-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2015-01-01") },
  { limbId: "work", threadType: "Skills", name: "Skills", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-03-01") },
  { limbId: "work", threadType: "Projects", name: "Projects", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-09-01") },
  { limbId: "work", threadType: "Leadership", name: "Leadership", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Vision", name: "Vision", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-01-01") },
  { limbId: "becoming", threadType: "Growth path", name: "Growth path", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-04-01") },
  { limbId: "becoming", threadType: "Identity", name: "Identity", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Habits", name: "Habits", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-08-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2005-01-01") },
  { limbId: "people", threadType: "Romance", name: "Romance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2012-05-01") },
  { limbId: "people", threadType: "Friendships", name: "Friendships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2014-02-01") },
  { limbId: "people", threadType: "Community", name: "Community", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-06-01") },
  { limbId: "health", threadType: "Fitness", name: "Fitness", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-01-01") },
  { limbId: "health", threadType: "Mental health", name: "Mental health", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-07-01") },
  { limbId: "health", threadType: "Sleep", name: "Sleep", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-03-01") },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-04-01") },
];

const markSeedsFullTreeShowcase: MarkSeed[] = [
  { branchThreadType: "Income", limbId: "finance", title: "First paycheque", description: "Demo mark on finance thread 0.", date: new Date("2016-06-01"), year: 2016, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Raise cycle", description: "Second demo mark.", date: new Date("2020-01-01"), year: 2020, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "ISA opened", description: "Finance thread 1.", date: new Date("2018-03-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "First index fund", description: "Growing allocation.", date: new Date("2022-04-01"), year: 2022, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Cash buffer", limbId: "finance", title: "Three-month runway", description: "Finance thread 2.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Cash buffer", limbId: "finance", title: "Stress drops", description: "Finance thread 2 continued.", date: new Date("2024-06-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Giving", limbId: "finance", title: "First recurring gift", description: "Finance thread 3.", date: new Date("2020-03-01"), year: 2020, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Giving", limbId: "finance", title: "Annual pledge up", description: "Finance thread 3 continued.", date: new Date("2024-01-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Career", limbId: "work", title: "First role", description: "Work thread 0.", date: new Date("2015-09-01"), year: 2015, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Leadership scope", description: "Work thread 0 continued.", date: new Date("2023-01-01"), year: 2023, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Skills", limbId: "work", title: "Deep technical focus", description: "Work thread 1.", date: new Date("2017-01-01"), year: 2017, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Skills", limbId: "work", title: "Teaching others", description: "Work thread 1 continued.", date: new Date("2024-06-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Projects", limbId: "work", title: "Side project shipped", description: "Work thread 2.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Projects", limbId: "work", title: "Flagship build", description: "Work thread 2 continued.", date: new Date("2024-11-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Leadership", limbId: "work", title: "First mentee", description: "Work thread 3.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Leadership", limbId: "work", title: "Team charter", description: "Work thread 3 continued.", date: new Date("2024-08-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Vision", limbId: "becoming", title: "North star written", description: "Becoming thread 0.", date: new Date("2019-03-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Vision", limbId: "becoming", title: "Vision refined", description: "Becoming thread 0 continued.", date: new Date("2024-01-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Growth path", limbId: "becoming", title: "Mentor season", description: "Becoming thread 1.", date: new Date("2019-08-01"), year: 2019, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Growth path", limbId: "becoming", title: "Course sprint", description: "Becoming thread 1 continued.", date: new Date("2023-05-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Values clarified", description: "Becoming thread 2.", date: new Date("2020-04-01"), year: 2020, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Identity", limbId: "becoming", title: "Identity in practice", description: "Becoming thread 2 continued.", date: new Date("2024-08-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Morning block", description: "Becoming thread 3.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Habits", limbId: "becoming", title: "Review ritual", description: "Becoming thread 3 continued.", date: new Date("2024-03-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Family", limbId: "people", title: "Childhood anchor", description: "People thread 0.", date: new Date("2005-06-01"), year: 2005, type: "milestone", significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Family", limbId: "people", title: "Family today", description: "People thread 0 continued.", date: new Date("2024-02-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Romance", limbId: "people", title: "First serious partner", description: "People thread 1.", date: new Date("2013-01-01"), year: 2013, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Romance", limbId: "people", title: "Partnership chapter", description: "People thread 1 continued.", date: new Date("2024-09-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Friendships", limbId: "people", title: "Core friend group", description: "People thread 2.", date: new Date("2015-01-01"), year: 2015, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Friendships", limbId: "people", title: "Deeper circle", description: "People thread 2 continued.", date: new Date("2023-11-01"), year: 2023, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Community", limbId: "people", title: "Local chapter", description: "People thread 3.", date: new Date("2018-02-01"), year: 2018, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Community", limbId: "people", title: "Hosting rhythm", description: "People thread 3 continued.", date: new Date("2024-04-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Fitness", limbId: "health", title: "Baseline fitness", description: "Health thread 0.", date: new Date("2018-04-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Fitness", limbId: "health", title: "Event training", description: "Health thread 0 continued.", date: new Date("2024-05-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Mental health", limbId: "health", title: "Therapy intake", description: "Health thread 1.", date: new Date("2019-09-01"), year: 2019, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Mental health", limbId: "health", title: "Stable cadence", description: "Health thread 1 continued.", date: new Date("2024-07-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Sleep", limbId: "health", title: "Sleep tracking", description: "Health thread 2.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Sleep", limbId: "health", title: "Seven-hour streak", description: "Health thread 2 continued.", date: new Date("2024-09-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Meal prep Sundays", description: "Health thread 3.", date: new Date("2022-06-01"), year: 2022, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Fuel for training", description: "Health thread 3 continued.", date: new Date("2025-01-01"), year: 2025, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
];

/**
 * Add two extra template moments per thread so the demo tree renders denser trajectories
 * without hand-authoring dozens of additional records.
 */
const extraTemplateMomentsFullTree: MarkSeed[] = branchSeedsFullTreeShowcase.flatMap((branch, idx) => {
  const startYear = branch.createdAt.getFullYear();
  const checkpointYear = startYear + 3 + (idx % 2);
  const reflectionYear = checkpointYear + 3;
  return [
    {
      branchThreadType: branch.threadType,
      limbId: branch.limbId,
      title: `${branch.threadType} checkpoint`,
      description: `Template milestone for ${branch.threadType}.`,
      date: new Date(`${checkpointYear}-06-01`),
      year: checkpointYear,
      type: "milestone",
      significance: 1,
      sentiment: "positive",
      value: null,
      isTurningPoint: false,
      future: false,
      bloomStatus: "BLOOMED",
    },
    {
      branchThreadType: branch.threadType,
      limbId: branch.limbId,
      title: `${branch.threadType} reflection`,
      description: `Template reflection for ${branch.threadType}.`,
      date: new Date(`${reflectionYear}-10-01`),
      year: reflectionYear,
      type: "realisation",
      significance: 2,
      sentiment: "positive",
      value: null,
      isTurningPoint: false,
      future: reflectionYear >= 2025,
      bloomStatus: reflectionYear >= 2025 ? "GROWING" : "BLOOMED",
    },
  ];
});

const markSeedsFullTreeShowcaseRich: MarkSeed[] = [
  ...markSeedsFullTreeShowcase,
  ...extraTemplateMomentsFullTree,
];

/** One starter thread per life area — attach roadmap goals via the UI; timeline stays empty until you add marks/events. */
const branchSeedsMyGoals: BranchSeed[] = [
  { limbId: "finance", threadType: "My finance focus", name: "My finance focus", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "BUD", createdAt: new Date("2026-01-01") },
  { limbId: "work", threadType: "My career focus", name: "My career focus", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "BUD", createdAt: new Date("2026-01-02") },
  { limbId: "becoming", threadType: "Growth", name: "Growth", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "BUD", createdAt: new Date("2026-01-03") },
  { limbId: "people", threadType: "Relationships", name: "Relationships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "BUD", createdAt: new Date("2026-01-04") },
  { limbId: "health", threadType: "Wellbeing", name: "Wellbeing", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "BUD", createdAt: new Date("2026-01-05") },
];

async function seedUserTree(passwordHash: string, seed: UserTreeSeed) {
  const existing = await prisma.user.findUnique({
    where: { email: seed.email },
    select: { id: true },
  });

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: seed.email,
        name: seed.name,
        passwordHash,
        onboardingCompleted: true,
      },
      select: { id: true },
    }));

  const existingBranchIds = await prisma.branch.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const branchIds = existingBranchIds.map((b) => b.id);
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  if (branchIds.length > 0) {
    await prisma.mark.deleteMany({ where: { branchId: { in: branchIds } } });
  }
  await prisma.branch.deleteMany({ where: { userId: user.id } });

  const createdBranches = [];
  const createdByThreadType = new Map<string, { id: string }>();
  const pending = [...seed.branchSeeds];
  let guard = 0;
  while (pending.length > 0 && guard < 2000) {
    guard += 1;
    const branchSeed = pending.shift()!;
    const parentBranchId = branchSeed.parentThreadType
      ? createdByThreadType.get(branchSeed.parentThreadType)?.id
      : null;
    if (branchSeed.parentThreadType && !parentBranchId) {
      pending.push(branchSeed);
      continue;
    }
    const branch = await prisma.branch.create({
      data: {
        userId: user.id,
        limbId: branchSeed.limbId,
        parentBranchId,
        label: branchSeed.threadType,
        name: branchSeed.name,
        goal: branchSeed.goal,
        goalValue: branchSeed.goalValue,
        currentValue: branchSeed.currentValue,
        unit: branchSeed.unit,
        status: branchSeed.status,
        bloomStatus: branchSeed.bloomStatus,
        createdAt: branchSeed.createdAt,
      },
    });
    createdBranches.push(branch);
    createdByThreadType.set(branchSeed.threadType, { id: branch.id });
  }
  if (pending.length > 0) {
    throw new Error(`Unresolved parentThreadType references for ${pending.length} branches (${seed.email})`);
  }

  const branchByThreadType = new Map(createdBranches.map((b) => [String(b.label ?? b.name ?? ""), b]));
  let createdMarks = 0;
  for (const markSeed of seed.markSeeds) {
    const branch = branchByThreadType.get(markSeed.branchThreadType);
    if (!branch) throw new Error(`Missing branch for threadType: ${markSeed.branchThreadType} (${seed.email})`);
    await prisma.mark.create({
      data: {
        userId: user.id,
        branchId: branch.id,
        limbId: markSeed.limbId,
        title: markSeed.title,
        description: markSeed.description,
        date: markSeed.date,
        year: markSeed.year,
        type: markSeed.type,
        significance: markSeed.significance,
        sentiment: markSeed.sentiment,
        value: markSeed.value,
        isTurningPoint: markSeed.isTurningPoint,
        future: markSeed.future,
        archived: false,
      },
    });
    createdMarks += 1;
  }

  console.log(`Seeded user: ${seed.email}`);
  console.log(`Branches created: ${createdBranches.length}`);
  console.log(`Marks created: ${createdMarks}`);
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  await seedUserTree(passwordHash, {
    email: "fulltree@pathfinder.test",
    name: "Full Tree Showcase",
    branchSeeds: branchSeedsFullTreeShowcase,
    markSeeds: markSeedsFullTreeShowcaseRich,
  });
  await seedUserTree(passwordHash, {
    email: "mygoals@pathfinder.test",
    name: "My goals",
    branchSeeds: branchSeedsMyGoals,
    markSeeds: [],
  });
}

main()
  .catch((error) => {
    console.error("Tree test seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
