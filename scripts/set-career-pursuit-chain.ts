/**
 * Query three Career pursuits and set continuation chain:
 *   IFA → parent = Mortgage broker
 *   International financial advisor → parent = IFA
 *
 * Run: npx tsx scripts/set-career-pursuit-chain.ts
 */
import { PrismaClient } from "@prisma/client";

const CAREER_BRANCH_ID = "cmp8wfcok0009vnu8aolonp5p";

const MORTGAGE_PATTERN = "mortgage broker";
const IFA_PATTERN = "independent financial advisor";
/** Matches "International financial advisor roles" style titles on Career hub. */
const INTL_PATTERN = "international";

const prisma = new PrismaClient();

type CareerGoalRow = {
  id: string;
  title: string;
  parentGoalId: string | null;
  categoryId: string | null;
  themeId: string | null;
};

function pickGoal(
  goals: CareerGoalRow[],
  pattern: string,
  opts?: { preferYear?: string; excludeIds?: string[] },
): CareerGoalRow | undefined {
  const exclude = new Set(opts?.excludeIds ?? []);
  const matches = goals.filter(
    (g) => !exclude.has(g.id) && g.title.toLowerCase().includes(pattern),
  );
  if (matches.length === 0) return undefined;
  if (opts?.preferYear) {
    const withYear = matches.find((g) => g.title.includes(opts.preferYear!));
    if (withYear) return withYear;
  }
  return matches.sort((a, b) => a.title.localeCompare(b.title))[0];
}

async function main() {
  const branch = await prisma.themeCategory.findUnique({
    where: { id: CAREER_BRANCH_ID },
    select: { id: true, label: true, name: true, themeId: true },
  });
  if (!branch) {
    console.error(`Career branch not found (id=${CAREER_BRANCH_ID}).`);
    process.exit(1);
  }
  console.log(`Career hub: ${branch.label ?? branch.name} (${branch.id})\n`);

  const goals = await prisma.goal.findMany({
    where: {
      categoryId: CAREER_BRANCH_ID,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      id: true,
      title: true,
      parentGoalId: true,
      sequencePosition: true,
      categoryId: true,
      themeId: true,
    },
    orderBy: { title: "asc" },
  });

  console.log("=== All pursuits on Career hub ===\n");
  for (const g of goals) {
    console.log(
      `  ${g.title}\n    id: ${g.id}\n    parentGoalId: ${g.parentGoalId ?? "(null)"}\n    sequencePosition: ${g.sequencePosition ?? "(null)"}\n`,
    );
  }

  const mortgage = pickGoal(goals, MORTGAGE_PATTERN);
  const ifa = pickGoal(goals, IFA_PATTERN, { preferYear: "2027" });
  const intl = pickGoal(goals, INTL_PATTERN, {
    excludeIds: [mortgage?.id, ifa?.id].filter(Boolean) as string[],
  });

  console.log("=== Matched targets ===\n");
  console.log("Mortgage broker:", mortgage?.title ?? "(not found)", mortgage?.id ?? "");
  console.log("Independent Financial Advisor:", ifa?.title ?? "(not found)", ifa?.id ?? "");
  console.log("International financial advisor:", intl?.title ?? "(not found)", intl?.id ?? "");
  console.log("");

  if (!mortgage || !ifa || !intl) {
    console.error("Could not match all three pursuits — aborting updates.");
    process.exit(1);
  }

  const desired: { id: string; title: string; parentGoalId: string | null }[] = [
    { id: ifa.id, title: ifa.title, parentGoalId: mortgage.id },
    { id: intl.id, title: intl.title, parentGoalId: ifa.id },
  ];

  const toApply = desired.filter((d) => {
    const current = goals.find((g) => g.id === d.id);
    return current?.parentGoalId !== d.parentGoalId;
  });

  if (toApply.length === 0) {
    console.log("Chain already correct — no updates needed.\n");
  } else {
    console.log("=== Applying parentGoalId chain ===\n");
    for (const u of toApply) {
      await prisma.goal.update({
        where: { id: u.id },
        data: {
          parentGoalId: u.parentGoalId,
          sequencePosition: null,
          categoryId: mortgage.categoryId,
          themeId: mortgage.themeId ?? goals.find((g) => g.id === u.id)?.limbId,
        },
      });
      console.log(`  ${u.title}`);
      console.log(`    parentGoalId → ${u.parentGoalId}\n`);
    }
  }

  const after = await prisma.goal.findMany({
    where: { id: { in: [mortgage.id, ifa.id, intl.id] } },
    select: {
      id: true,
      title: true,
      parentGoalId: true,
      parentGoal: { select: { title: true } },
    },
    orderBy: { title: "asc" },
  });

  console.log("=== After update ===\n");
  for (const g of after) {
    console.log(
      `  ${g.title}\n    id: ${g.id}\n    parentGoalId: ${g.parentGoalId ?? "(null)"}${g.parentGoal ? ` (${g.parentGoal.title})` : ""}\n`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
