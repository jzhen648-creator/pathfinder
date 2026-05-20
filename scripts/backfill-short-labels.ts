/**
 * Populate `Goal.shortLabel` for roadmap rows (excludes timeline moment/event goals).
 *
 * Requires GEMINI_API_KEY. Rate-limited to avoid hammering the provider (100 ms between writes).
 *
 * From pathfinder/: npx tsx scripts/backfill-short-labels.ts
 * Flags: --dry-run | --replace-stale (clear and regenerate labels that are missing or fail salience — including numeric targets without unit/magnitude)
 */
import { labelPreservesSalience } from "../src/lib/canvas-label-salience";
import { prisma } from "../src/lib/prisma";
import { persistGoalShortLabel } from "../src/lib/goal-short-label";

const dryRun = process.argv.includes("--dry-run");
const replaceStale = process.argv.includes("--replace-stale");
const DELAY_MS = 100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const goals = await prisma.goal.findMany({
    where: {
      goalType: { notIn: ["moment", "event"] },
      ...(replaceStale ? {} : { shortLabel: null }),
    },
    select: { id: true, title: true, description: true, shortLabel: true },
    orderBy: { id: "asc" },
  });

  const targets = replaceStale
    ? goals.filter(
        (g) =>
          !g.shortLabel ||
          !labelPreservesSalience(g.shortLabel, g.title, g.description),
      )
    : goals;

  console.log(
    `[backfill-short-labels] ${dryRun ? "DRY RUN — " : ""}found ${targets.length} goal(s) to label` +
      (replaceStale ? ` (${goals.length} roadmap goals scanned)` : ""),
  );

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const g = targets[i]!;
    if (dryRun) {
      console.log(`  [dry-run] ${g.id} — ${JSON.stringify(g.title)}`);
      continue;
    }
    try {
      if (replaceStale) {
        await prisma.goal.update({ where: { id: g.id }, data: { shortLabel: null } });
      }
      await persistGoalShortLabel(g.id);
      const row = await prisma.goal.findFirst({
        where: { id: g.id },
        select: { shortLabel: true },
      });
      if (row?.shortLabel) {
        console.log(`  ok ${g.id} → ${JSON.stringify(row.shortLabel)}`);
        ok += 1;
      } else {
        console.log(`  skip ${g.id} (generation failed or invalid output)`);
        failed += 1;
      }
    } catch (e) {
      console.error(`  error ${g.id}`, e);
      failed += 1;
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  if (!dryRun) {
    console.log(`Done. labeled=${ok} skipped_or_failed=${failed} total=${targets.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
