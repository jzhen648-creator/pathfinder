import type { BloomStatus, BranchStatus, MarkSentiment, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { JEREMY_PROFILE, JEREMY_SEEDS } from "@/lib/fixtures/jeremy-profile-seed";
import { getLifeArea } from "@/lib/life-areas";
import { mockHubSeedsToGoalSeeds, mockHubSeedsToTreeSeeds, type TreeGoalSeed } from "@/lib/mock-seeds-to-tree-seed";
import { NEW_PROFILE_ROOT_BRANCH_TEMPLATES } from "@/lib/new-profile-tree-branches";

/**
 * Dev tree fixtures for `*.@pathfinder.test` — CLI: `npm run seed:tree` (optional POST /api/dev/reset-tree-profiles).
 * - fulltree@pathfinder.test / password123 — profile "1", showcase branches + marks
 * - mygoals@pathfinder.test / password123 — profile "2", locked taxonomy starter hubs per theme
 * - jeremy@pathfinder.test / password123 — profile "3", Jeremy life data (17 hubs)
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
  significance: number;
  sentiment: MarkSentiment;
  value: number | null;
  isTurningPoint: boolean;
  future: boolean;
};

type UserTreeSeed = {
  email: string;
  name: string;
  birthYear?: number | null;
  birthPlace?: string | null;
  branchSeeds: BranchSeed[];
  markSeeds: MarkSeed[];
  goalSeeds?: TreeGoalSeed[];
};

/**
 * Root branches per theme, aligned with `LOCKED_HUB_TEMPLATES` / fork geometry.
 */
const branchSeedsFullTreeShowcase: BranchSeed[] = [
  { limbId: "finance", threadType: "Income", name: "Income", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2016-01-01") },
  { limbId: "finance", threadType: "Assets", name: "Assets", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2017-06-01") },
  { limbId: "finance", threadType: "Safety net", name: "Safety net", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2018-03-01") },
  { limbId: "finance", threadType: "Liabilities", name: "Liabilities", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2019-05-01") },
  { limbId: "work", threadType: "Career", name: "Career", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2015-01-01") },
  { limbId: "work", threadType: "Skills", name: "Skills", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2016-03-01") },
  { limbId: "work", threadType: "Builds & Launches", name: "Builds & Launches", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2018-09-01") },
  { limbId: "becoming", threadType: "Purpose & Values", name: "Purpose & Values", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2019-01-01") },
  { limbId: "becoming", threadType: "Mind & Emotions", name: "Mind & Emotions", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2020-02-01") },
  { limbId: "becoming", threadType: "Joy & Creativity", name: "Joy & Creativity", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2022-06-01") },
  { limbId: "people", threadType: "Family", name: "Family", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2005-01-01") },
  { limbId: "people", threadType: "Romance", name: "Romance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2012-05-01") },
  { limbId: "people", threadType: "Friendships", name: "Friendships", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2014-02-01") },
  { limbId: "health", threadType: "Movement", name: "Movement", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2018-01-01") },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2021-04-01") },
  { limbId: "health", threadType: "Appearance", name: "Appearance", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2019-07-01") },
  { limbId: "health", threadType: "Rest", name: "Rest", goal: null, goalValue: null, currentValue: null, unit: null, status: "active", bloomStatus: "ACTIVE", createdAt: new Date("2020-03-01") },
];

const markSeedsFullTreeShowcase: MarkSeed[] = [
  { branchThreadType: "Income", limbId: "finance", title: "First paycheque", description: "Demo mark on finance thread 0.", date: new Date("2016-06-01"), year: 2016, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Income", limbId: "finance", title: "Raise cycle", description: "Second demo mark.", date: new Date("2020-01-01"), year: 2020, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Assets", limbId: "finance", title: "ISA opened", description: "Finance thread 1.", date: new Date("2018-03-01"), year: 2018, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Assets", limbId: "finance", title: "First index fund", description: "Growing allocation.", date: new Date("2022-04-01"), year: 2022, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Assets", limbId: "finance", title: "Three-month runway", description: "Merged investing cushion milestone.", date: new Date("2019-01-01"), year: 2019, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Assets", limbId: "finance", title: "Stress drops", description: "Asset runway feels real.", date: new Date("2024-06-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Safety net", limbId: "finance", title: "Emergency fund target hit", description: "Finance safety net thread.", date: new Date("2019-08-01"), year: 2019, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Safety net", limbId: "finance", title: "Insurance stack reviewed", description: "Safety net thread continued.", date: new Date("2024-03-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Liabilities", limbId: "finance", title: "Credit card cleared", description: "Finance debt thread.", date: new Date("2020-03-01"), year: 2020, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Liabilities", limbId: "finance", title: "Mortgage refi locked", description: "Debt thread continued.", date: new Date("2024-01-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Career", limbId: "work", title: "First role", description: "Work thread 0.", date: new Date("2015-09-01"), year: 2015, significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Career", limbId: "work", title: "Leadership scope", description: "Work thread 0 continued.", date: new Date("2023-01-01"), year: 2023, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Skills", limbId: "work", title: "Deep technical focus", description: "Work thread 1.", date: new Date("2017-01-01"), year: 2017, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Skills", limbId: "work", title: "Teaching others", description: "Work thread 1 continued.", date: new Date("2024-06-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Builds & Launches", limbId: "work", title: "Side project shipped", description: "Work thread 2.", date: new Date("2019-01-01"), year: 2019, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Builds & Launches", limbId: "work", title: "Flagship build", description: "Work thread 2 continued.", date: new Date("2024-11-01"), year: 2024, significance: 3, sentiment: "positive", value: null, isTurningPoint: true, future: true },
  { branchThreadType: "Skills", limbId: "work", title: "First mentee", description: "Work skills thread.", date: new Date("2021-01-01"), year: 2021, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Skills", limbId: "work", title: "Team charter", description: "Work skills continued.", date: new Date("2024-08-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Purpose & Values", limbId: "becoming", title: "North star written", description: "Becoming thread 0.", date: new Date("2019-03-01"), year: 2019, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Purpose & Values", limbId: "becoming", title: "Vision refined", description: "Becoming thread 0 continued.", date: new Date("2024-01-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Purpose & Values", limbId: "becoming", title: "Mentor season", description: "Becoming purpose thread.", date: new Date("2019-08-01"), year: 2019, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Purpose & Values", limbId: "becoming", title: "Course sprint", description: "Becoming purpose continued.", date: new Date("2023-05-01"), year: 2023, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Mind & Emotions", limbId: "becoming", title: "Values clarified", description: "Becoming mind thread.", date: new Date("2020-04-01"), year: 2020, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Mind & Emotions", limbId: "becoming", title: "Identity in practice", description: "Becoming mind continued.", date: new Date("2024-08-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Mind & Emotions", limbId: "becoming", title: "Morning block", description: "Becoming mind thread.", date: new Date("2021-01-01"), year: 2021, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Mind & Emotions", limbId: "becoming", title: "Review ritual", description: "Becoming mind continued.", date: new Date("2024-03-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Joy & Creativity", limbId: "becoming", title: "Returned to weekend sketching", description: "Becoming joy thread.", date: new Date("2021-08-01"), year: 2021, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Joy & Creativity", limbId: "becoming", title: "First solo trip abroad", description: "Becoming joy continued.", date: new Date("2023-05-01"), year: 2023, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Family", limbId: "people", title: "Childhood anchor", description: "People thread 0.", date: new Date("2005-06-01"), year: 2005, significance: 2, sentiment: "neutral", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Family", limbId: "people", title: "Family today", description: "People thread 0 continued.", date: new Date("2024-02-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Romance", limbId: "people", title: "First serious partner", description: "People thread 1.", date: new Date("2013-01-01"), year: 2013, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Romance", limbId: "people", title: "Partnership chapter", description: "People thread 1 continued.", date: new Date("2024-09-01"), year: 2024, significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Friendships", limbId: "people", title: "Core friend group", description: "People thread 2.", date: new Date("2015-01-01"), year: 2015, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Friendships", limbId: "people", title: "Deeper circle", description: "People thread 2 continued.", date: new Date("2023-11-01"), year: 2023, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Friendships", limbId: "people", title: "Local chapter", description: "People friendships thread.", date: new Date("2018-02-01"), year: 2018, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Friendships", limbId: "people", title: "Hosting rhythm", description: "People friendships continued.", date: new Date("2024-04-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Movement", limbId: "health", title: "Baseline fitness", description: "Health thread 0.", date: new Date("2018-04-01"), year: 2018, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Movement", limbId: "health", title: "Event training", description: "Health thread 0 continued.", date: new Date("2024-05-01"), year: 2024, significance: 3, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Appearance", limbId: "health", title: "Invisalign consult booked", description: "Health appearance thread.", date: new Date("2019-09-01"), year: 2019, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Appearance", limbId: "health", title: "Treatment plan locked", description: "Appearance continued.", date: new Date("2024-07-01"), year: 2024, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Rest", limbId: "health", title: "Sleep tracking", description: "Health rest thread.", date: new Date("2021-01-01"), year: 2021, significance: 1, sentiment: "neutral", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Rest", limbId: "health", title: "Protected quiet mornings", description: "Rest continued.", date: new Date("2025-11-01"), year: 2025, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
  { branchThreadType: "Nutrition", limbId: "health", title: "Meal prep Sundays", description: "Health thread 3.", date: new Date("2022-06-01"), year: 2022, significance: 1, sentiment: "positive", value: null, isTurningPoint: false, future: false },
  { branchThreadType: "Nutrition", limbId: "health", title: "Fuel for training", description: "Health thread 3 continued.", date: new Date("2025-01-01"), year: 2025, significance: 2, sentiment: "positive", value: null, isTurningPoint: false, future: true },
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
      status: "COMPLETE",
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
      status: reflectionYear >= 2025 ? "ACTIVE" : "COMPLETE",
    },
  ];
});

const markSeedsFullTreeShowcaseRich: MarkSeed[] = [
  ...markSeedsFullTreeShowcase,
  ...extraTemplateMomentsFullTree,
];

/** Starter hubs per locked template (empty canvas, five themes); same template as post-onboarding `ensureNewProfileBranches`. */
const branchSeedsMyGoals: BranchSeed[] = NEW_PROFILE_ROOT_BRANCH_TEMPLATES.map((t, i) => ({
  limbId: t.limbId,
  threadType: t.threadType,
  name: t.name,
  goal: null,
  goalValue: null,
  currentValue: null,
  unit: null,
  status: "active",
  bloomStatus: "ACTIVE",
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
}));

export async function seedUserTree(prisma: PrismaClient, passwordHash: string, seed: UserTreeSeed) {
  const seedsExistingMapContent = seed.markSeeds.length > 0 || (seed.goalSeeds?.length ?? 0) > 0;
  const existing = await prisma.user.findUnique({
    where: { email: seed.email },
    select: { id: true },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: seed.name,
          passwordHash,
          onboardingCompleted: true,
          ...(seedsExistingMapContent ? { firstRunCompleted: true } : {}),
          ...(seed.birthYear !== undefined ? { birthYear: seed.birthYear } : {}),
          ...(seed.birthPlace !== undefined ? { birthPlace: seed.birthPlace } : {}),
        },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          email: seed.email,
          name: seed.name,
          passwordHash,
          onboardingCompleted: true,
          firstRunCompleted: seedsExistingMapContent,
          birthYear: seed.birthYear ?? null,
          birthPlace: seed.birthPlace ?? null,
        },
        select: { id: true },
      });

  const existingBranchIds = await prisma.themeCategory.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const branchIds = existingBranchIds.map((b) => b.id);
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  if (branchIds.length > 0) {
    await prisma.mark.deleteMany({ where: { categoryId: { in: branchIds } } });
  }
  await prisma.themeCategory.deleteMany({ where: { userId: user.id } });

  const createdBranches = [];
  const createdByThreadType = new Map<string, { id: string }>();
  const pending = [...seed.branchSeeds];
  let guard = 0;
  while (pending.length > 0 && guard < 2000) {
    guard += 1;
    const branchSeed = pending.shift()!;
    const parentCategoryId = branchSeed.parentThreadType
      ? createdByThreadType.get(branchSeed.parentThreadType)?.id
      : null;
    if (branchSeed.parentThreadType && !parentCategoryId) {
      pending.push(branchSeed);
      continue;
    }
    const branch = await prisma.themeCategory.create({
      data: {
        userId: user.id,
        limbId: branchSeed.limbId,
        parentCategoryId,
        label: branchSeed.threadType,
        name: branchSeed.name,
        goal: branchSeed.goal,
        goalValue: branchSeed.goalValue,
        currentValue: branchSeed.currentValue,
        unit: branchSeed.unit,
        status: branchSeed.status,
        bloomStatus: branchSeed.bloomStatus,
        isSystemCategory: true,
        isActive: true,
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
        categoryId: branch.id,
        limbId: markSeed.limbId,
        title: markSeed.title,
        description: markSeed.description,
        date: markSeed.date,
        year: markSeed.year,
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

  let createdGoals = 0;
  for (const goalSeed of seed.goalSeeds ?? []) {
    const branch = branchByThreadType.get(goalSeed.branchThreadType);
    if (!branch) {
      throw new Error(`Missing branch for goal threadType: ${goalSeed.branchThreadType} (${seed.email})`);
    }
    const lifeArea = getLifeArea(goalSeed.limbId)?.label ?? "Other";
    await prisma.goal.create({
      data: {
        userId: user.id,
        categoryId: branch.id,
        limbId: goalSeed.limbId,
        title: goalSeed.title,
        description: goalSeed.description,
        lifeArea,
        goalType: goalSeed.goalType,
        targetAmount: goalSeed.targetAmount,
        currentAmount: goalSeed.currentAmount,
        unit: goalSeed.unit,
        status: goalSeed.bloomStatus,
        significance: goalSeed.significance,
        future: goalSeed.future,
        year: goalSeed.year,
        aiGenerated: false,
        milestones: {
          create: goalSeed.milestones.map((m) => ({
            title: m.title,
            description: m.description,
            position: m.position,
            completedAt: m.completedAt,
          })),
        },
      },
    });
    createdGoals += 1;
  }

  console.log(`Seeded user: ${seed.email}`);
  console.log(`Branches created: ${createdBranches.length}`);
  console.log(`Marks created: ${createdMarks}`);
  if (createdGoals > 0) console.log(`Goals created: ${createdGoals}`);
}

/** Re-seeds all `*.@pathfinder.test` demo users to match `npm run seed:tree`. */
export async function seedAllTreeTestProfiles(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash("password123", 10);
  const jeremyTree = mockHubSeedsToTreeSeeds(JEREMY_SEEDS);
  const jeremyGoals = mockHubSeedsToGoalSeeds(JEREMY_SEEDS);
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
  await seedUserTree(prisma, passwordHash, {
    email: JEREMY_PROFILE.email,
    name: "3",
    birthYear: JEREMY_PROFILE.birthYear,
    birthPlace: JEREMY_PROFILE.birthPlace,
    branchSeeds: jeremyTree.branchSeeds,
    markSeeds: jeremyTree.markSeeds,
    goalSeeds: jeremyGoals,
  });
}
