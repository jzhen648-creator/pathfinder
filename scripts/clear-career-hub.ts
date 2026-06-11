/**
 * Clears goals and marks on the Career hub branch and work-theme Stream sessions.
 * Dev reset for re-testing Stream cross-session hierarchy.
 *
 * Run: npx tsx scripts/clear-career-hub.ts
 */
import { PrismaClient } from "@prisma/client";
import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";

/** Career hub branch from dev tree (see scripts/query-child-pursuits.ts). */
const CAREER_BRANCH_ID = "cmp8wfcok0009vnu8aolonp5p";
const WORK_THEME_ID = "work";

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.themeCategory.findUnique({
    where: { id: CAREER_BRANCH_ID },
    select: { id: true, label: true, name: true, userId: true, limbId: true },
  });

  if (!branch) {
    console.error(`Career branch not found (id=${CAREER_BRANCH_ID}).`);
    process.exit(1);
  }

  const goals = await prisma.goal.deleteMany({ where: { categoryId: branch.id } });
  const marks = await prisma.mark.deleteMany({ where: { categoryId: branch.id } });

  const streamSession = getStreamSessionDelegate(prisma);
  let sessionCount = 0;
  if (streamSession) {
    const sessions = await streamSession.deleteMany({
      where: { userId: branch.userId, limbId: WORK_THEME_ID },
    });
    sessionCount = sessions.count;
  } else {
    console.warn("StreamSession delegate unavailable — skipped session wipe.");
  }

  console.log(
    `Cleared Career hub "${branch.label ?? branch.name}" (${branch.id}, theme ${branch.limbId ?? WORK_THEME_ID})`,
  );
  console.log(`  goals deleted:              ${goals.count}`);
  console.log(`  marks deleted:              ${marks.count}`);
  console.log(`  work StreamSession deleted: ${sessionCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
