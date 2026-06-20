/**
 * Read-only audit: pursuits likely marked COMPLETE by milestone rollup (pre status-fix).
 *
 * Run: npx tsx scripts/audit-wrongly-complete-pursuits.ts
 * Repair (after approval): npx tsx scripts/repair-wrongly-complete-pursuits.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const goals = await prisma.goal.findMany({
    where: {
      archived: false,
      status: "COMPLETE",
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      id: true,
      title: true,
      userId: true,
      status: true,
      goalType: true,
      targetAmount: true,
      currentAmount: true,
      completedAt: true,
      milestones: { select: { id: true, title: true, completedAt: true } },
    },
    orderBy: { title: "asc" },
  });

  const quantifiedUnderTarget = goals.filter(
    (g) =>
      g.targetAmount != null &&
      g.targetAmount > 0 &&
      (g.currentAmount == null || g.currentAmount < g.targetAmount),
  );

  const allMilestonesComplete = goals.filter(
    (g) =>
      g.milestones.length > 0 && g.milestones.every((m) => m.completedAt != null),
  );

  const repairCandidates = goals.filter((g) => {
    if (g.milestones.length === 0) return false;
    if (!g.milestones.every((m) => m.completedAt != null)) return false;
    return true;
  });

  console.log("=== Wrongly-COMPLETE pursuit audit (read-only) ===\n");
  console.log(`Total COMPLETE non-moment/event pursuits: ${goals.length}`);
  console.log(`Quantified + under target: ${quantifiedUnderTarget.length}`);
  console.log(`All milestones complete (rollup candidates): ${allMilestonesComplete.length}`);
  console.log(`Proposed repair set (all milestones done, normal goalType): ${repairCandidates.length}\n`);

  if (quantifiedUnderTarget.length > 0) {
    console.log("--- Quantified under target ---");
    for (const g of quantifiedUnderTarget) {
      console.log(
        `  ${g.id} | ${g.title} | target=${g.targetAmount} current=${g.currentAmount ?? 0} | milestones=${g.milestones.length}`,
      );
    }
    console.log("");
  }

  if (repairCandidates.length > 0) {
    console.log("--- Repair candidates (would set ACTIVE, clear completedAt) ---");
    for (const g of repairCandidates.slice(0, 50)) {
      console.log(
        `  ${g.id} | ${g.title} | milestones ${g.milestones.filter((m) => m.completedAt).length}/${g.milestones.length}`,
      );
    }
    if (repairCandidates.length > 50) {
      console.log(`  ... and ${repairCandidates.length - 50} more`);
    }
  }

  console.log("\nRepair plan: run repair script with --apply after logic fix ships.");
  console.log("Manual user COMPLETE (all steps done) cannot be distinguished — review list before --apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
