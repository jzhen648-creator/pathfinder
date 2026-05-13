/**
 * Deletes legacy scaffolding Subtask rows (auto “Complete this step” / renamed “Optional detail”).
 * Milestone truth is `completedAt` + real substeps; these rows only added noise.
 *
 * Run from pathfinder/: npm run backfill:delete-scaffolding-subtasks
 */
import { prisma } from "../src/lib/prisma";
import { isScaffoldingSubtaskTitle } from "../src/lib/legacy-subtask-placeholder-title";

async function main() {
  const rows = await prisma.subtask.findMany({ select: { id: true, title: true } });
  const hits = rows.filter((r) => isScaffoldingSubtaskTitle(r.title));
  if (hits.length === 0) {
    console.log("[backfill-delete-scaffolding-subtasks] No scaffolding subtasks — nothing to do.");
    return;
  }
  const res = await prisma.subtask.deleteMany({
    where: { id: { in: hits.map((h) => h.id) } },
  });
  console.log(`[backfill-delete-scaffolding-subtasks] Deleted ${res.count} subtask(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
