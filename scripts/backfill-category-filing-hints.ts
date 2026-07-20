/**
 * Re-file custom chapters that still sit on a theme-default hub when the
 * expanded NAME_FILING_HINTS would place them elsewhere.
 *
 * Run from pathfinder/:
 *   Dry run (default): npx tsx scripts/backfill-category-filing-hints.ts
 *   Apply:             npx tsx scripts/backfill-category-filing-hints.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import type { ChapterTypeId } from "../src/lib/chapter-types";
import {
  isThemeDefaultHubLabel,
  resolveTitleRenameRefile,
} from "../src/lib/category-derivation";
import { resolveBranchForHub } from "../src/lib/resolve-category";
import { activateCategoryForUser } from "../src/lib/system-categories";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import type { LifeAreaId } from "../src/lib/types";
import { isLifeAreaId } from "../src/lib/unlocked-themes";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

async function main() {
  const goals = await prisma.goal.findMany({
    where: {
      archived: false,
      goalType: { notIn: ["moment", "event"] },
      categoryId: { not: null },
      themeId: { not: null },
    },
    select: {
      id: true,
      title: true,
      userId: true,
      themeId: true,
      categoryId: true,
      chapterType: true,
      themeCategory: { select: { id: true, label: true } },
    },
  });

  console.log(
    `${dryRun ? "[dry-run] " : ""}Scanning ${goals.length} active chapter(s) for hint re-file…`,
  );

  let wouldMove = 0;
  let moved = 0;
  let skipped = 0;

  const usersTouched = new Set<string>();

  for (const goal of goals) {
    if (!goal.themeId || !isLifeAreaId(goal.themeId) || !goal.themeCategory?.label) {
      skipped += 1;
      continue;
    }

    const themeId = goal.themeId as LifeAreaId;
    if (!isThemeDefaultHubLabel(themeId, goal.themeCategory.label)) {
      skipped += 1;
      continue;
    }

    const { shouldRefile, filing } = resolveTitleRenameRefile({
      themeId,
      currentHubLabel: goal.themeCategory.label,
      newTitle: goal.title,
      chapterType: (goal.chapterType ?? "custom") as ChapterTypeId | null,
    });

    if (!shouldRefile) {
      skipped += 1;
      continue;
    }

    wouldMove += 1;
    console.log(
      `  ${goal.id} — "${goal.title}" [${themeId}] ${goal.themeCategory.label} → ${filing.hubLabel}`,
    );

    if (dryRun) continue;

    if (!usersTouched.has(goal.userId)) {
      await ensureTaxonomyCurrent(prisma, goal.userId);
      usersTouched.add(goal.userId);
    }

    const resolved = await resolveBranchForHub(prisma, goal.userId, themeId, filing.hubSlug);
    if (!resolved || resolved.categoryId === goal.categoryId) {
      skipped += 1;
      continue;
    }

    const nextCategory = await prisma.themeCategory.findFirst({
      where: { id: resolved.categoryId, userId: goal.userId },
      select: { id: true, isActive: true },
    });
    if (!nextCategory) {
      skipped += 1;
      continue;
    }
    if (!nextCategory.isActive) {
      await activateCategoryForUser(prisma, goal.userId, nextCategory.id);
    }

    await prisma.goal.update({
      where: { id: goal.id },
      data: { categoryId: resolved.categoryId },
    });
    moved += 1;
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would re-file ${wouldMove} chapter(s); skipped ${skipped}. Re-run with --apply to write.`,
    );
  } else {
    console.log(`Backfill complete: re-filed ${moved} chapter(s); skipped ${skipped}.`);
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
