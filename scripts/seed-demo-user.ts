/**
 * Seed Alex Carter demo persona — isolated from the pinned dev account.
 * Run: npm run seed:demo-user
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ALEX_CARTER_PROFILE,
  ALEX_CARTER_SEEDS,
  ALEX_CARTER_TREE_NOW,
} from "../src/lib/fixtures/alex-carter-profile-seed";
import { getLifeArea } from "../src/lib/life-areas";
import {
  mockHubSeedsToGoalSeeds,
  mockHubSeedsToTreeSeeds,
} from "../src/lib/mock-seeds-to-tree-seed";
import { seedUserTree } from "../src/lib/tree-test-profiles-seed";

const prisma = new PrismaClient();

/** Never modify the main dev account or canonical tree fixtures. */
const PROTECTED_EMAILS = new Set([
  process.env.NEXT_PUBLIC_DEV_PIN_USER_EMAIL ?? "jzhen648@gmail.com",
  "fulltree@pathfinder.test",
  "mygoals@pathfinder.test",
  "jeremy@pathfinder.test",
]);

const DEMO_PASSWORD = "password123";

async function seedContinuationChains(userId: string) {
  const careerBranch = await prisma.branch.findFirst({
    where: { userId, limbId: "work", label: "Career" },
    select: { id: true },
  });
  if (!careerBranch) {
    console.warn("  Skipping continuation chains — Career hub not found");
    return;
  }

  const root = await prisma.goal.findFirst({
    where: {
      userId,
      branchId: careerBranch.id,
      parentGoalId: null,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });
  if (!root) {
    console.warn("  Skipping continuation chains — no root career pursuit");
    return;
  }

  const existingChild = await prisma.goal.findFirst({
    where: { userId, parentGoalId: root.id },
    select: { id: true },
  });
  if (existingChild) {
    console.log("  Continuation chain already present — skipping");
    return;
  }

  const lifeArea = getLifeArea("work")?.label ?? "Work & Career";

  const chapter2 = await prisma.goal.create({
    data: {
      userId,
      branchId: careerBranch.id,
      limbId: "work",
      parentGoalId: root.id,
      title: "Lead payments platform through Series B scale-up",
      description:
        "Continuation after owning squad discovery-to-delivery — broader org impact and hiring bar.",
      lifeArea,
      goalType: "project",
      bloomStatus: "ACTIVE",
      year: 2027,
      deadline: new Date("2027-12-31"),
      aiGenerated: false,
      milestones: {
        create: [
          {
            title: "Hire two staff engineers",
            description: "Backfill and grow team for H2 roadmap.",
            position: 0,
          },
          {
            title: "Exec roadmap sign-off",
            description: "Aligned Q3–Q4 bets with CPO.",
            position: 1,
          },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.goal.create({
    data: {
      userId,
      branchId: careerBranch.id,
      limbId: "work",
      parentGoalId: chapter2.id,
      title: "Director of Product track — first panel loop",
      description: "Third chapter: begin informal DP conversations after platform outcomes land.",
      lifeArea,
      goalType: "identity",
      bloomStatus: "ACTIVE",
      year: 2028,
      aiGenerated: false,
      shortLabel: "DP track",
    },
  });

  const assetsBranch = await prisma.branch.findFirst({
    where: { userId, limbId: "finance", label: "Assets" },
    select: { id: true },
  });
  if (assetsBranch) {
    const depositRoot = await prisma.goal.findFirst({
      where: {
        userId,
        branchId: assetsBranch.id,
        parentGoalId: null,
        title: { contains: "deposit" },
      },
      select: { id: true },
    });
    if (depositRoot) {
      const hasChild = await prisma.goal.findFirst({
        where: { userId, parentGoalId: depositRoot.id },
        select: { id: true },
      });
      if (!hasChild) {
        await prisma.goal.create({
          data: {
            userId,
            branchId: assetsBranch.id,
            limbId: "finance",
            parentGoalId: depositRoot.id,
            title: "Save £55k deposit fund by 2028 (stretch)",
            description: "Continuation: raised target after LISA growth and side-income plan.",
            lifeArea: getLifeArea("finance")?.label ?? "Finance",
            goalType: "project",
            targetAmount: 55000,
            currentAmount: 18500,
            unit: "£",
            bloomStatus: "ACTIVE",
            year: 2028,
            aiGenerated: false,
          },
        });
      }
    }
  }

  console.log("  Continuation chains: Career (depth 3), Assets (depth 2)");
}

async function main() {
  if (PROTECTED_EMAILS.has(ALEX_CARTER_PROFILE.email)) {
    throw new Error(`Refusing to seed protected email: ${ALEX_CARTER_PROFILE.email}`);
  }

  const tree = mockHubSeedsToTreeSeeds(ALEX_CARTER_SEEDS, { now: ALEX_CARTER_TREE_NOW });
  const goalSeeds = mockHubSeedsToGoalSeeds(ALEX_CARTER_SEEDS, { now: ALEX_CARTER_TREE_NOW });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log(`Seeding demo user: ${ALEX_CARTER_PROFILE.email}`);
  console.log(`Protected accounts untouched: ${[...PROTECTED_EMAILS].join(", ")}\n`);

  await seedUserTree(prisma, passwordHash, {
    email: ALEX_CARTER_PROFILE.email,
    name: ALEX_CARTER_PROFILE.name,
    birthYear: ALEX_CARTER_PROFILE.birthYear,
    birthPlace: ALEX_CARTER_PROFILE.birthPlace,
    branchSeeds: tree.branchSeeds,
    markSeeds: tree.markSeeds,
    goalSeeds,
  });

  const user = await prisma.user.findUnique({
    where: { email: ALEX_CARTER_PROFILE.email },
    select: { id: true },
  });
  if (!user) {
    throw new Error("Demo user missing after seed");
  }

  await seedContinuationChains(user.id);

  const counts = await Promise.all([
    prisma.branch.count({ where: { userId: user.id } }),
    prisma.mark.count({ where: { userId: user.id } }),
    prisma.goal.count({ where: { userId: user.id } }),
    prisma.milestone.count({ where: { goal: { userId: user.id } } }),
  ]);

  console.log(`\nDone. Login: ${ALEX_CARTER_PROFILE.email} / ${DEMO_PASSWORD}`);
  console.log(
    `Counts — hubs: ${counts[0]}, marks: ${counts[1]}, pursuits: ${counts[2]}, milestones: ${counts[3]}`,
  );
  console.log("Themes: finance, work, becoming, people, health (17 locked hubs)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
