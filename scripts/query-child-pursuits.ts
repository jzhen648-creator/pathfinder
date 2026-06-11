import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TITLES = [
  "Become Head of Product",
  "Improve executive communication",
  "Build external profile",
];

async function main() {
  const goals = await prisma.goal.findMany({
    where: { title: { in: TITLES } },
    select: {
      id: true,
      title: true,
      parentGoalId: true,
      categoryId: true,
      goalType: true,
      status: true,
      sequencePosition: true,
      userId: true,
      parentGoal: { select: { id: true, title: true } },
      forkedGoals: { select: { id: true, title: true } },
    },
    orderBy: { title: "asc" },
  });

  console.log("=== Goals matching titles (exact) ===\n");
  if (goals.length === 0) {
    console.log("No rows found. Trying case-insensitive contains...\n");
    const fuzzy = await prisma.goal.findMany({
      where: {
        OR: TITLES.map((t) => ({
          title: { contains: t.split(" ")[0], mode: "insensitive" as const },
        })),
      },
      select: {
        id: true,
        title: true,
        parentGoalId: true,
        categoryId: true,
        sequencePosition: true,
        parentGoal: { select: { id: true, title: true } },
      },
      take: 20,
    });
    console.log(JSON.stringify(fuzzy, null, 2));
    return;
  }

  for (const g of goals) {
    console.log(`title: ${g.title}`);
    console.log(`  id: ${g.id}`);
    console.log(`  categoryId: ${g.categoryId}`);
    console.log(`  parentGoalId: ${g.parentGoalId ?? "(null)"}`);
    console.log(
      `  parent title: ${g.parentGoal?.title ?? "(none)"} (${g.parentGoal?.id ?? "—"})`,
    );
    console.log(`  sequencePosition: ${g.sequencePosition ?? "(null)"}`);
    console.log(`  status: ${g.status}`);
    if (g.forkedGoals.length > 0) {
      console.log(`  forkedGoals (continuations): ${g.forkedGoals.map((f) => f.title).join("; ")}`);
    }
    console.log("");
  }

  const careerBranchId = "cmp8wfcok0009vnu8aolonp5p";
  const branch = await prisma.themeCategory.findUnique({
    where: { id: careerBranchId },
    select: { id: true, label: true, name: true, limbId: true },
  });
  console.log("=== Career branch (cmp8wfcok0009vnu8aolonp5p) ===\n");
  console.log(JSON.stringify(branch, null, 2));
  const branchGoals = await prisma.goal.findMany({
    where: { categoryId: careerBranchId, goalType: { notIn: ["moment", "event"] } },
    select: {
      id: true,
      title: true,
      parentGoalId: true,
      sequencePosition: true,
      parentGoal: { select: { title: true } },
    },
    orderBy: [{ sequencePosition: "asc" }, { title: "asc" }],
  });
  console.log("\nAll pursuits on that branch:\n");
  for (const g of branchGoals) {
    console.log(
      `  [seq ${g.sequencePosition ?? "null"}] ${g.title} | parentGoalId=${g.parentGoalId ?? "null"}${g.parentGoal ? ` (${g.parentGoal.title})` : ""}`,
    );
  }
  console.log("");

  const head = goals.find(
    (g) => g.title === "Become Head of Product" && g.categoryId === careerBranchId,
  );
  if (head) {
    const children = await prisma.goal.findMany({
      where: { parentGoalId: head.id },
      select: {
        id: true,
        title: true,
        parentGoalId: true,
        sequencePosition: true,
        categoryId: true,
      },
      orderBy: { title: "asc" },
    });
    console.log(`=== All goals with parentGoalId = Head of Product (${head.id}) ===\n`);
    if (children.length === 0) {
      console.log("(none)\n");
    } else {
      for (const c of children) {
        console.log(`  - ${c.title}`);
        console.log(`      id: ${c.id}`);
        console.log(`      sequencePosition: ${c.sequencePosition ?? "(null)"}`);
        console.log(`      categoryId: ${c.categoryId}`);
      }
      console.log("");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
