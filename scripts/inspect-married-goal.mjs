import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const goals = await p.goal.findMany({
    where: {
      OR: [{ title: { contains: "Married" } }, { title: { contains: "Romance" } }],
    },
    select: {
      id: true,
      title: true,
      branchId: true,
      parentGoalId: true,
      goalType: true,
      future: true,
      bloomStatus: true,
    },
  });
  console.log("GOALS:");
  console.log(JSON.stringify(goals, null, 2));

  const branchIds = [...new Set(goals.map((g) => g.branchId))];
  const branches = await p.branch.findMany({
    where: { id: { in: branchIds } },
    select: {
      id: true,
      name: true,
      label: true,
      limbId: true,
      parentBranchId: true,
      createdAt: true,
    },
  });
  console.log("BRANCHES FOR THESE GOALS:");
  console.log(JSON.stringify(branches, null, 2));

  const allPeopleBranches = await p.branch.findMany({
    where: { limbId: "people", parentBranchId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      label: true,
      limbId: true,
      parentBranchId: true,
      createdAt: true,
    },
  });
  console.log("ALL ROOT BRANCHES ON people (ordered by createdAt):");
  console.log(JSON.stringify(allPeopleBranches, null, 2));

  const peopleGoals = await p.goal.findMany({
    where: { branch: { limbId: "people" } },
    select: {
      id: true,
      title: true,
      branchId: true,
      parentGoalId: true,
      goalType: true,
      future: true,
      bloomStatus: true,
      branch: { select: { name: true, createdAt: true } },
    },
  });
  console.log("ALL GOALS ON people limb:");
  console.log(JSON.stringify(peopleGoals, null, 2));

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
