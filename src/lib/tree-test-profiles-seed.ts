import type { BloomStatus, BranchStatus, MarkSentiment, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getLifeArea } from "@/lib/life-areas";
import { NEW_PROFILE_ROOT_BRANCH_TEMPLATES } from "@/lib/new-profile-tree-branches";
import type { TreeGoalSeed } from "@/lib/mock-seeds-to-tree-seed";

/** Empty-canvas dev account — CLI: `npm run seed:tree` (optional POST /api/dev/reset-tree-profiles). */
export const DEV_EMPTY_CANVAS_EMAIL = "mygoals@pathfinder.test";
export const DEV_EMPTY_CANVAS_PASSWORD = "password123";

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

/** Locked taxonomy starter categories per theme — no pursuits, marks, or goals. */
const branchSeedsEmptyCanvas: BranchSeed[] = NEW_PROFILE_ROOT_BRANCH_TEMPLATES.map((t, i) => ({
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
        themeId: branchSeed.limbId,
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
        themeId: markSeed.limbId,
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
        themeId: goalSeed.limbId,
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

/** Re-seeds the empty-canvas dev account (`mygoals@pathfinder.test`). */
export async function seedAllTreeTestProfiles(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_EMPTY_CANVAS_PASSWORD, 10);
  await seedUserTree(prisma, passwordHash, {
    email: DEV_EMPTY_CANVAS_EMAIL,
    name: "Dev empty canvas",
    branchSeeds: branchSeedsEmptyCanvas,
    markSeeds: [],
  });
}
