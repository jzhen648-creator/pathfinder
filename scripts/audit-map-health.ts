/**
 * Map data-quality audit across users (or one user via --email).
 * Run: npm run audit:map-health
 *      npx tsx scripts/audit-map-health.ts --email fulltree@pathfinder.test
 */
import { PrismaClient } from "@prisma/client";
import { LIFE_AREA_IDS } from "../src/lib/taxonomy";

const prisma = new PrismaClient();

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const emailFlagIdx = process.argv.indexOf("--email");
const emailFromFlag =
  emailFlagIdx >= 0 && process.argv[emailFlagIdx + 1] ? process.argv[emailFlagIdx + 1] : undefined;
const filterEmail = emailArg ?? emailFromFlag ?? process.env.AUDIT_EMAIL;

type HubRow = {
  hub: string;
  theme: string;
  goals: number;
  marks: number;
  milestones: number;
};

function isRoadmapGoal(goalType: string): boolean {
  return goalType !== "moment" && goalType !== "event";
}

function continuationDepths(goals: { id: string; parentGoalId: string | null }[]): number[] {
  const childrenByParent = new Map<string, string[]>();
  const ids = new Set(goals.map((g) => g.id));
  for (const g of goals) {
    if (!g.parentGoalId || !ids.has(g.parentGoalId)) continue;
    const list = childrenByParent.get(g.parentGoalId) ?? [];
    list.push(g.id);
    childrenByParent.set(g.parentGoalId, list);
  }

  const roots = goals.filter((g) => !g.parentGoalId || !ids.has(g.parentGoalId));
  const depths: number[] = [];

  function walk(id: string, depth: number) {
    depths.push(depth);
    for (const childId of childrenByParent.get(id) ?? []) {
      walk(childId, depth + 1);
    }
  }

  for (const root of roots) {
    walk(root.id, 1);
  }
  return depths;
}

async function auditUser(userId: string, email: string) {
  const branches = await prisma.themeCategory.findMany({
    where: { userId },
    select: { id: true, themeId: true, label: true, name: true, status: true },
    orderBy: [{ limbId: "asc" }, { label: "asc" }],
  });
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: {
      id: true,
      title: true,
      categoryId: true,
      parentGoalId: true,
      status: true,
      goalType: true,
      shortLabel: true,
    },
  });
  const marks = await prisma.mark.findMany({
    where: { userId, archived: false },
    select: { id: true, categoryId: true },
  });
  const milestones = await prisma.milestone.findMany({
    where: { goal: { userId, archived: false } },
    select: { id: true, goalId: true },
  });

  const branchIds = new Set(branches.map((b) => b.id));
  const goalsByBranch = new Map<string, number>();
  const marksByBranch = new Map<string, number>();
  const milestonesByBranch = new Map<string, number>();

  for (const g of goals) {
    if (!g.categoryId) continue;
    goalsByBranch.set(g.categoryId, (goalsByBranch.get(g.categoryId) ?? 0) + 1);
  }
  for (const m of marks) {
    marksByBranch.set(m.categoryId, (marksByBranch.get(m.categoryId) ?? 0) + 1);
  }
  const goalToBranch = new Map(goals.map((g) => [g.id, g.categoryId]));
  for (const ms of milestones) {
    const branchId = goalToBranch.get(ms.goalId);
    if (!branchId) continue;
    milestonesByBranch.set(branchId, (milestonesByBranch.get(branchId) ?? 0) + 1);
  }

  const hubRows: HubRow[] = branches.map((b) => ({
    hub: b.label ?? b.name ?? b.id.slice(0, 8),
    theme: b.themeId,
    goals: goalsByBranch.get(b.id) ?? 0,
    marks: marksByBranch.get(b.id) ?? 0,
    milestones: milestonesByBranch.get(b.id) ?? 0,
  }));

  const zeroDataHubs = hubRows.filter((r) => r.goals === 0 && r.marks === 0 && r.milestones === 0);

  const goalBloom: Record<string, number> = {};
  const branchBloom: Record<string, number> = {};
  for (const g of goals) {
    goalBloom[g.status] = (goalBloom[g.status] ?? 0) + 1;
  }
  for (const b of branches) {
    branchBloom[b.status] = (branchBloom[b.status] ?? 0) + 1;
  }

  const goalIds = new Set(goals.map((g) => g.id));
  const orphanedGoals = goals.filter(
    (g) =>
      g.categoryId == null ||
      !branchIds.has(g.categoryId) ||
      (g.parentGoalId != null && !goalIds.has(g.parentGoalId)),
  );

  const nullShortLabels = goals.filter(
    (g) => isRoadmapGoal(g.goalType) && (g.shortLabel == null || g.shortLabel.trim() === ""),
  );

  const chainGoals = goals.filter((g) => isRoadmapGoal(g.goalType));
  const depths = continuationDepths(chainGoals);
  const depthHistogram = new Map<number, number>();
  for (const d of depths) {
    depthHistogram.set(d, (depthHistogram.get(d) ?? 0) + 1);
  }
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

  console.log(`\n=== ${email} ===`);
  console.log(
    `Branches: ${branches.length} | Goals: ${goals.length} | Marks: ${marks.length} | Milestones: ${milestones.length}`,
  );

  console.log("\nPer-hub counts:");
  console.log("Theme      Hub                    Goals  Marks  Milestones");
  console.log("---------  ---------------------  -----  -----  ----------");
  for (const row of hubRows) {
    const theme = row.theme.padEnd(9);
    const hub = row.hub.slice(0, 21).padEnd(21);
    console.log(
      `${theme}  ${hub}  ${String(row.goals).padStart(5)}  ${String(row.marks).padStart(5)}  ${String(row.milestones).padStart(10)}`,
    );
  }

  const themesMissing = LIFE_AREA_IDS.filter(
    (themeId) => !branches.some((b) => b.themeId === themeId),
  );

  console.log("\nSummary:");
  console.log(`  Zero-data hubs:        ${zeroDataHubs.length}${zeroDataHubs.length ? ` (${zeroDataHubs.map((h) => h.hub).join(", ")})` : ""}`);
  console.log(`  Themes with no hubs:   ${themesMissing.length}${themesMissing.length ? ` (${themesMissing.join(", ")})` : ""}`);
  console.log(`  Goal bloom:            ${JSON.stringify(goalBloom)}`);
  console.log(`  Branch bloom:          ${JSON.stringify(branchBloom)}`);
  console.log(`  Orphaned goals:        ${orphanedGoals.length}`);
  console.log(`  Null shortLabels:      ${nullShortLabels.length} (roadmap goals)`);
  console.log(`  Continuation depths:   max=${maxDepth} histogram=${JSON.stringify(Object.fromEntries(depthHistogram))}`);

  if (orphanedGoals.length > 0) {
    console.log("\n  Orphaned goal sample:");
    for (const g of orphanedGoals.slice(0, 5)) {
      console.log(`    - ${g.id.slice(0, 10)}… ${JSON.stringify(g.title.slice(0, 50))}`);
    }
  }

  return {
    email,
    hubs: branches.length,
    zeroDataHubs: zeroDataHubs.length,
    orphanedGoals: orphanedGoals.length,
    nullShortLabels: nullShortLabels.length,
    maxContinuationDepth: maxDepth,
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

  console.log(`Map health audit — ${users.length} user(s)${filterEmail ? ` (${filterEmail})` : ""}`);

  const summaries = [];
  for (const user of users) {
    summaries.push(await auditUser(user.id, user.email));
  }

  if (summaries.length > 1) {
    console.log("\n=== All users summary ===");
    console.log("Email                              Hubs  Zero  Orphan  NoLabel  MaxChain");
    console.log("---------------------------------  ----  ----  ------  -------  --------");
    for (const s of summaries) {
      const em = s.email.padEnd(33);
      console.log(
        `${em}  ${String(s.hubs).padStart(4)}  ${String(s.zeroDataHubs).padStart(4)}  ${String(s.orphanedGoals).padStart(6)}  ${String(s.nullShortLabels).padStart(7)}  ${String(s.maxContinuationDepth).padStart(8)}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
