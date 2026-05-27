/**
 * Backfill UserMemory for existing users who have no context blob yet.
 *
 * 1. seedUserMemory from onboarding / manual profile fields
 * 2. If still empty, synthesize from recent StreamSession input text
 *
 * Run from pathfinder/: npx tsx scripts/backfill-user-memory.ts
 * Dry run: DRY_RUN=1 npx tsx scripts/backfill-user-memory.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedUserMemory } from "../src/lib/memory/seed-memory";
import { updateUserMemory } from "../src/lib/memory/update-memory";

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const MAX_SESSION_CHARS = 6000;

async function recentStreamText(userId: string): Promise<string | null> {
  const sessions = await prisma.streamSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { inputText: true },
  });
  if (sessions.length === 0) return null;
  const parts = sessions
    .map((s) => s.inputText.trim())
    .filter(Boolean)
    .reverse();
  const combined = parts.join("\n\n").trim();
  if (!combined) return null;
  return combined.length > MAX_SESSION_CHARS
    ? combined.slice(combined.length - MAX_SESSION_CHARS)
    : combined;
}

async function needsBackfill(userId: string): Promise<boolean> {
  const row = await prisma.userMemory.findUnique({
    where: { userId },
    select: { blob: true },
  });
  return !row?.blob?.trim();
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  let seeded = 0;
  let fromStream = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (!(await needsBackfill(user.id))) {
      skipped += 1;
      continue;
    }

    console.log(`\n${user.email}`);

    if (dryRun) {
      const u = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          onboardingProfileText: true,
          manualProfile: { select: { id: true } },
        },
      });
      const hasOnboarding = Boolean(
        u?.onboardingProfileText?.trim() || u?.manualProfile,
      );
      const streamText = await recentStreamText(user.id);
      console.log(
        `  would seed: onboarding=${hasOnboarding ? "yes" : "no"}, streamSessions=${streamText ? "yes" : "no"}`,
      );
      continue;
    }

    try {
      const fromSeed = await seedUserMemory(user.id);
      if (fromSeed?.blob.trim()) {
        console.log(`  seeded from onboarding/manual (${fromSeed.version})`);
        seeded += 1;
        continue;
      }

      const sessionText = await recentStreamText(user.id);
      if (!sessionText) {
        console.log("  skip — no onboarding source and no stream sessions");
        skipped += 1;
        continue;
      }

      const fromUpdate = await updateUserMemory(user.id, sessionText);
      if (fromUpdate?.blob.trim()) {
        console.log(`  built from stream sessions (${fromUpdate.version})`);
        fromStream += 1;
      } else {
        console.log("  failed — update returned empty");
        failed += 1;
      }
    } catch (err) {
      console.error("  error:", err instanceof Error ? err.message : err);
      failed += 1;
    }
  }

  console.log(
    `\nDone. seeded=${seeded}, fromStream=${fromStream}, skipped=${skipped}, failed=${failed}${dryRun ? " (dry run)" : ""}.`,
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
