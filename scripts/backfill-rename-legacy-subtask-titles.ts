/**
 * Renames legacy auto-created placeholder subtasks (e.g. "Complete this step") to neutral copy.
 * Does not delete rows or touch isCompleted / completedAt — display-only cleanup.
 *
 * Run from pathfinder/: npm run backfill:rename-legacy-subtasks
 */
import { prisma } from "../src/lib/prisma";
import { RENAMED_LEGACY_SUBTASK_TITLE } from "../src/lib/legacy-subtask-placeholder-title";

/** Titles from an older implementation that encouraged checkbox-only completion. */
function isLegacyPlaceholderTitle(title: string): boolean {
  const t = title.trim().replace(/\s+/g, " ");
  return /^complete (this|the) step\.?$/i.test(t);
}

async function main() {
  const rows = await prisma.subtask.findMany({
    select: { id: true, title: true },
  });

  const hits = rows.filter((r) => isLegacyPlaceholderTitle(r.title));
  if (hits.length === 0) {
    console.log("[backfill-rename-legacy-subtask-titles] No matching subtasks — nothing to do.");
    return;
  }

  for (const h of hits) {
    await prisma.subtask.update({
      where: { id: h.id },
      data: { title: RENAMED_LEGACY_SUBTASK_TITLE },
    });
    console.log("[backfill-rename-legacy-subtask-titles]", {
      id: h.id,
      from: JSON.stringify(h.title),
      to: RENAMED_LEGACY_SUBTASK_TITLE,
    });
  }

  console.log(`[backfill-rename-legacy-subtask-titles] Updated ${hits.length} subtask(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
