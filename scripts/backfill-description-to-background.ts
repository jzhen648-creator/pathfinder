/**
 * Copy Goal.description → Goal.background where background is empty and description has text.
 *
 * Run from pathfinder/: npx tsx scripts/backfill-description-to-background.ts
 * Dry run (default): npx tsx scripts/backfill-description-to-background.ts --dry-run
 * Apply: npx tsx scripts/backfill-description-to-background.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const dryRun = !process.argv.includes("--apply");

async function main() {
  const candidates = await prisma.goal.findMany({
    where: {
      description: { not: "" },
      OR: [{ background: null }, { background: "" }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      background: true,
    },
  });

  console.log(
    `${dryRun ? "[dry-run] " : ""}Found ${candidates.length} goal(s) with description text and empty background.`,
  );

  let updated = 0;
  for (const goal of candidates) {
    const description = goal.description?.trim();
    if (!description) continue;

    console.log(`  ${goal.id} — "${goal.title}" (${description.length} chars)`);

    if (!dryRun) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { background: description },
      });
    }
    updated += 1;
  }

  console.log(
    dryRun
      ? `[dry-run] Would update ${updated} goal(s). Re-run with --apply to write.`
      : `Backfill complete: updated ${updated} goal(s).`,
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
