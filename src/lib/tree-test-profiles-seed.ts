import type {
  BloomStatus,
  BranchStatus,
  MarkSentiment,
  MarkType,
  PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { NEW_PROFILE_ROOT_BRANCH_TEMPLATES } from "@/lib/new-profile-tree-branches";

/**
 * Dev tree fixtures for `*.@pathfinder.test` (see GET /api/dev/mock-users, POST /api/dev/reset-tree-profiles).
 * CLI: `npm run seed:tree`
 * - fulltree@pathfinder.test / password123 — profile "1", showcase branches + marks
 * - mygoals@pathfinder.test / password123 — profile "2", four starter threads per life area
 */

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
 * Four root branches per limb (24 threads), aligned with fork geometry — see AREA_FORKS_BASE &
 * THREAD_SLOTS.
 */
const branchSeedsFullTreeShowcase: BranchSeed[] = [
  { limbId: "finance", threadType: "Income", name: "Income", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-01-01") },
  { limbId: "finance", threadType: "Investing", name: "Investing", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2017-06-01") },
  { limbId: "finance", threadType: "Protection", name: "Protection", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-03-01") },
  { limbId: "finance", threadType: "Giving", name: "Giving", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-05-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2015-01-01") },
  { limbId: "work", threadType: "Skills", name: "Skills", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-03-01") },
  { limbId: "work", threadType: "Projects", name: "Projects", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-09-01") },
  { limbId: "work", threadType: "Network", name: "Network", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Purpose", name: "Purpose", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-01-01") },
  { limbId: "becoming", threadType: "Spirituality", name: "Spirituality", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-04-01") },
  { limbId: "becoming", threadType: "Inner work", name: "Inner work", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Habits", name: "Habits", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-08-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2005-01-01") },
  { limbId: "people", threadType: "Romance", name: "Romance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2012-05-01") },
  { limbId: "people", threadType: "Friendships", name: "Friendships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2014-02-01") },
  { limbId: "people", threadType: "Community", name: "Community", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2016-06-01") },
  { limbId: "health", threadType: "Movement", name: "Movement", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2018-01-01") },
  { limbId: "health", threadType: "Mind", name: "Mind", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2019-07-01") },
  { limbId: "health", threadType: "Sleep", name: "Sleep", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2020-03-01") },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-04-01") },
  { limbId: "pleasures", threadType: "Hobbies", name: "Hobbies", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-06-01") },
  { limbId: "pleasures", threadType: "Culture", name: "Culture", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2021-09-01") },
  { limbId: "pleasures", threadType: "Experiences", name: "Experiences", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-01-01") },
  { limbId: "pleasures", threadType: "Downtime", name: "Downtime", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "GROWING", createdAt: new Date("2022-04-01") },
];

const markSeedsFullTreeShowcase: MarkSeed[] = [
  { branchThreadType: "Income", limbId: "finance", title: "First paycheque", description: "Demo mark on finance thread 0.", date: new Date("2016-06-01"), year: 2016, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Income", limbId: "finance", title: "Raise cycle", description: "Second demo mark.", date: new Date("2020-01-01"), year: 2020, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "ISA opened", description: "Finance thread 1.", date: new Date("2018-03-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "First index fund", description: "Growing allocation.", date: new Date("2022-04-01"), year: 2022, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Investing", limbId: "finance", title: "Three-month runway", description: "Merged investing cushion milestone.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Investing", limbId: "finance", title: "Stress drops", description: "Investing runway feels real.", date: new Date("2024-06-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Protection", limbId: "finance", title: "Emergency fund target hit", description: "Finance protection thread.", date: new Date("2019-08-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Protection", limbId: "finance", title: "Insurance stack reviewed", description: "Protection thread continued.", date: new Date("2024-03-01"), year: 2024, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Giving", limbId: "finance", title: "First recurring gift", description: "Finance thread 3.", date: new Date("2020-03-01"), year: 2020, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Giving", limbId: "finance", title: "Annual pledge up", description: "Finance thread 3 continued.", date: new Date("2024-01-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Career", limbId: "work", title: "First role", description: "Work thread 0.", date: new Date("2015-09-01"), year: 2015, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Career", limbId: "work", title: "Leadership scope", description: "Work thread 0 continued.", date: new Date("2023-01-01"), year: 2023, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Skills", limbId: "work", title: "Deep technical focus", description: "Work thread 1.", date: new Date("2017-01-01"), year: 2017, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Skills", limbId: "work", title: "Teaching others", description: "Work thread 1 continued.", date: new Date("2024-06-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Projects", limbId: "work", title: "Side project shipped", description: "Work thread 2.", date: new Date("2019-01-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Projects", limbId: "work", title: "Flagship build", description: "Work thread 2 continued.", date: new Date("2024-11-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Network", limbId: "work", title: "First mentee", description: "Work thread 3.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Network", limbId: "work", title: "Team charter", description: "Work thread 3 continued.", date: new Date("2024-08-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Purpose", limbId: "becoming", title: "North star written", description: "Becoming thread 0.", date: new Date("2019-03-01"), year: 2019, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Purpose", limbId: "becoming", title: "Vision refined", description: "Becoming thread 0 continued.", date: new Date("2024-01-01"), year: 2024, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Spirituality", limbId: "becoming", title: "Mentor season", description: "Becoming thread 1.", date: new Date("2019-08-01"), year: 2019, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Spirituality", limbId: "becoming", title: "Course sprint", description: "Becoming thread 1 continued.", date: new Date("2023-05-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "GROWING" },
  { branchThreadType: "Inner work", limbId: "becoming", title: "Values clarified", description: "Becoming thread 2.", date: new Date("2020-04-01"), year: 2020, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Inner work", limbId: "becoming", title: "Identity in practice", description: "Becoming thread 2 continued.", date: new Date("2024-08-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
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
  { branchThreadType: "Movement", limbId: "health", title: "Baseline fitness", description: "Health thread 0.", date: new Date("2018-04-01"), year: 2018, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Movement", limbId: "health", title: "Event training", description: "Health thread 0 continued.", date: new Date("2024-05-01"), year: 2024, type: "milestone", significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Mind", limbId: "health", title: "Therapy intake", description: "Health thread 1.", date: new Date("2019-09-01"), year: 2019, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Mind", limbId: "health", title: "Stable cadence", description: "Health thread 1 continued.", date: new Date("2024-07-01"), year: 2024, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Sleep", limbId: "health", title: "Sleep tracking", description: "Health thread 2.", date: new Date("2021-01-01"), year: 2021, type: "milestone", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Sleep", limbId: "health", title: "Seven-hour streak", description: "Health thread 2 continued.", date: new Date("2024-09-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Meal prep Sundays", description: "Health thread 3.", date: new Date("2022-06-01"), year: 2022, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Nutrition", limbId: "health", title: "Fuel for training", description: "Health thread 3 continued.", date: new Date("2025-01-01"), year: 2025, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Hobbies", limbId: "pleasures", title: "Returned to weekend sketching", description: "Pleasures thread 0.", date: new Date("2021-08-01"), year: 2021, type: "milestone", significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Hobbies", limbId: "pleasures", title: "Built a small studio nook", description: "Pleasures thread 0 continued.", date: new Date("2024-06-01"), year: 2024, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Culture", limbId: "pleasures", title: "Season ticket ritual", description: "Pleasures thread 1.", date: new Date("2022-03-01"), year: 2022, type: "decision", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Culture", limbId: "pleasures", title: "Gallery Sundays", description: "Pleasures thread 1 continued.", date: new Date("2025-02-01"), year: 2025, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Experiences", limbId: "pleasures", title: "First solo trip abroad", description: "Pleasures thread 2.", date: new Date("2023-05-01"), year: 2023, type: "achievement", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Experiences", limbId: "pleasures", title: "Annual adventure budget", description: "Pleasures thread 2 continued.", date: new Date("2025-09-01"), year: 2025, type: "realisation", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
  { branchThreadType: "Downtime", limbId: "pleasures", title: "Screen Sabbath experiment", description: "Pleasures thread 3.", date: new Date("2024-01-01"), year: 2024, type: "decision", significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false, bloomStatus: "BLOOMED" },
  { branchThreadType: "Downtime", limbId: "pleasures", title: "Protected quiet mornings", description: "Pleasures thread 3 continued.", date: new Date("2025-11-01"), year: 2025, type: "milestone", significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true, bloomStatus: "GROWING" },
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

/** Four starter threads per life area (empty canvas, six areas); same template as post-onboarding `ensureNewProfileBranches`. */
const branchSeedsMyGoals: BranchSeed[] = NEW_PROFILE_ROOT_BRANCH_TEMPLATES.map((t, i) => ({
  limbId: t.limbId,
  threadType: t.threadType,
  name: t.name,
  goal: null,
  goalValue: null,
  currentValue: null,
  unit: null,
  status: "active",
  bloomStatus: "BUD",
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
}));

export async function seedUserTree(prisma: PrismaClient, passwordHash: string, seed: UserTreeSeed) {
  const existing = await prisma.user.findUnique({
    where: { email: seed.email },
    select: { id: true },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: seed.name, passwordHash, onboardingCompleted: true },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          email: seed.email,
          name: seed.name,
          passwordHash,
          onboardingCompleted: true,
        },
        select: { id: true },
      });

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

/** Re-seeds both `*.@pathfinder.test` demo users to match `npm run seed:tree`. */
export async function seedAllTreeTestProfiles(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash("password123", 10);
  await seedUserTree(prisma, passwordHash, {
    email: "fulltree@pathfinder.test",
    name: "1",
    branchSeeds: branchSeedsFullTreeShowcase,
    markSeeds: markSeedsFullTreeShowcaseRich,
  });
  await seedUserTree(prisma, passwordHash, {
    email: "mygoals@pathfinder.test",
    name: "2",
    branchSeeds: branchSeedsMyGoals,
    markSeeds: [],
  });
}
