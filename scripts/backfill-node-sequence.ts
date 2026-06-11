/**
 * Backfill explicit branch-level node ordering across `Goal` + `Mark`.
 *
 * For each `Branch`, list non-evolution `Goal` rows (`parentGoalId IS NULL`) plus non-archived `Mark` rows
 * **and** `Goal{goalType: moment|event}` rows (the goal-typed moments stay visually correct on the
 * branch line until the separate retirement sprint runs). Sort by `(year ?? date-year, month ?? date-month,
 * createdAt)` ascending and assign `sequencePosition = 100, 200, 300, …` so future inserts have plenty
 * of midpoint room.
 *
 * From pathfinder/: npx tsx scripts/backfill-node-sequence.ts
 * Flags: --dry-run
 *
 * Idempotent: rows that already have a `sequencePosition` are left alone unless `--force` is passed.
 */
import { prisma } from "../src/lib/prisma";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const STEP = 100;

type SortRow = {
  kind: "goal" | "mark";
  id: string;
  year: number | null;
  month: number | null;
  createdAt: Date;
};

function sortKey(a: SortRow, b: SortRow): number {
  const ay = a.year ?? Number.POSITIVE_INFINITY;
  const by = b.year ?? Number.POSITIVE_INFINITY;
  if (ay !== by) return ay - by;
  const am = a.month ?? 0;
  const bm = b.month ?? 0;
  if (am !== bm) return am - bm;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

async function main() {
  const branches = await prisma.themeCategory.findMany({
    select: { id: true, userId: true, limbId: true },
  });
  console.log(
    `[backfill-node-sequence] ${dryRun ? "DRY RUN \u2014 " : ""}${force ? "FORCE \u2014 " : ""}scanning ${branches.length} branch(es)`,
  );

  let goalsUpdated = 0;
  let marksUpdated = 0;
  let branchesTouched = 0;

  for (const branch of branches) {
    const [goals, marks] = await Promise.all([
      prisma.goal.findMany({
        where: { categoryId: branch.id, parentGoalId: null },
        select: {
          id: true,
          year: true,
          month: true,
          createdAt: true,
          sequencePosition: true,
        },
      }),
      prisma.mark.findMany({
        where: { categoryId: branch.id, archived: false },
        select: {
          id: true,
          year: true,
          month: true,
          date: true,
          createdAt: true,
          sequencePosition: true,
        },
      }),
    ]);

    if (goals.length === 0 && marks.length === 0) continue;

    const rows: SortRow[] = [
      ...goals.map((g) => ({
        kind: "goal" as const,
        id: g.id,
        year: g.year ?? null,
        month: g.month ?? null,
        createdAt: g.createdAt,
      })),
      ...marks.map((m) => ({
        kind: "mark" as const,
        id: m.id,
        year: m.year ?? (m.date ? m.date.getFullYear() : null),
        month: m.month ?? (m.date ? m.date.getMonth() + 1 : null),
        createdAt: m.createdAt,
      })),
    ];
    rows.sort(sortKey);

    let localGoals = 0;
    let localMarks = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const seq = (i + 1) * STEP;
      const existing =
        row.kind === "goal"
          ? goals.find((g) => g.id === row.id)?.sequencePosition ?? null
          : marks.find((m) => m.id === row.id)?.sequencePosition ?? null;
      if (existing !== null && !force) continue;
      if (dryRun) {
        console.log(
          `  [dry-run] branch=${branch.id} ${row.kind}=${row.id} \u2192 seq=${seq}`,
        );
        if (row.kind === "goal") localGoals += 1;
        else localMarks += 1;
        continue;
      }
      if (row.kind === "goal") {
        await prisma.goal.update({
          where: { id: row.id },
          data: { sequencePosition: seq },
        });
        localGoals += 1;
      } else {
        await prisma.mark.update({
          where: { id: row.id },
          data: { sequencePosition: seq },
        });
        localMarks += 1;
      }
    }
    if (localGoals + localMarks > 0) {
      branchesTouched += 1;
      goalsUpdated += localGoals;
      marksUpdated += localMarks;
      if (!dryRun) {
        console.log(
          `  branch=${branch.id} goals=${localGoals} marks=${localMarks}`,
        );
      }
    }
  }

  console.log(
    `Done. branches=${branchesTouched} goals=${goalsUpdated} marks=${marksUpdated}${dryRun ? " (dry run)" : ""}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
