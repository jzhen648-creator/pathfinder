/**
 * Strips mirrored quick-question prose from Goal.description before structured
 * enrichAnswers ship in map_context. Run once on deploy alongside the QQ-collapse PR.
 *
 * Run from pathfinder/: npm run migrate:qq-answer-collapse
 * Also runs automatically in `npm run build` (before next build).
 */
import { migrateStripQqProseFromDescriptions } from "../src/lib/pursuit/pursuit-context-log";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await migrateStripQqProseFromDescriptions();
  console.log(
    `QQ description migration complete: updated ${result.updated} / ${result.scanned} pursuits.`,
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
