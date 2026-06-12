/**
 * One-time migration: copy legacy `Goal.treeMilestones` JSON into relational `Milestone` rows.
 * Run **before** applying `20260513220000_drop_goal_tree_milestones` if your DB still has the column.
 *
 *   npx tsx scripts/backfill-tree-milestones-to-relational.ts
 *   npx tsx scripts/backfill-tree-milestones-to-relational.ts --dry-run
 */
import { PrismaClient } from "@prisma/client";
import { recomputeGoalBloomStatus } from "../src/lib/goal-status-recompute";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

type LegacyOrbital = { id: string; title: string; completed: boolean };

function parseLegacyJson(raw: unknown): LegacyOrbital[] {
  let coerced = raw;
  if (typeof raw === "string") {
    try {
      coerced = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(coerced)) return [];
  const out: LegacyOrbital[] = [];
  for (const row of coerced) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!id || !title) continue;
    out.push({ id, title, completed: Boolean(rec.completed) });
  }
  return out;
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ id: string; treeMilestones: unknown }[]>(
    `SELECT id, treeMilestones FROM Goal WHERE json_array_length(treeMilestones) > 0`,
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await prisma.milestone.count({ where: { goalId: row.id } });
    if (existing > 0) {
      skipped += 1;
      continue;
    }
    const legacy = parseLegacyJson(row.treeMilestones);
    if (legacy.length === 0) {
      skipped += 1;
      continue;
    }

    console.log(`${dryRun ? "[dry-run] " : ""}Goal ${row.id}: ${legacy.length} legacy orbital(s)`);
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < legacy.length; i += 1) {
          const o = legacy[i]!;
          await tx.milestone.create({
            data: {
              goalId: row.id,
              title: o.title,
              description: "",
              position: i,
              ...(o.completed ? { completedAt: new Date() } : {}),
            },
          });
        }
      });
      await recomputeGoalBloomStatus(row.id);
    }
    migrated += 1;
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} dryRun=${dryRun}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
