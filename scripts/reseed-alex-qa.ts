/**
 * Reseed Alex QA account — honest descriptions, 17 pursuits, no AI caches.
 *
 * Run:
 *   npx tsx scripts/reseed-alex-qa.ts
 *   npm run reseed:alex-qa
 *
 * Keeps User + UserManualProfile; wipes map/AI data and re-inserts pursuits.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  activateCategoryForUser,
  activateLimbsForUser,
} from "../src/lib/system-categories";
import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import { unlockThemesForUser } from "../src/lib/unlocked-themes";
import { ALEX_HONEST_PURSUITS } from "./alex-reseed-pursuits";
import {
  ALEX_PROFILE,
  findSystemCategory,
  insertPursuit,
  themeLabel,
} from "./seed-ai-qa-data";

const ALEX_EMAIL = ALEX_PROFILE.email;

function loadEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function wipeAlexMapContent(prisma: PrismaClient, userId: string): Promise<void> {
  const streamSession = getStreamSessionDelegate(prisma);

  await prisma.reframe.deleteMany({ where: { mark: { userId } } });
  await prisma.aiReadingDirtyItem.deleteMany({ where: { userId } });
  await prisma.goalEvaluationCache.deleteMany({ where: { userId } });
  await prisma.streamRun.deleteMany({ where: { userId } });
  if (streamSession) {
    await streamSession.deleteMany({ where: { userId } });
  }
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.mark.deleteMany({ where: { userId } });
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.storyCache.deleteMany({ where: { userId } });
  await prisma.userMemoryHistory.deleteMany({ where: { userId } });
  await prisma.userMemory.deleteMany({ where: { userId } });
  await prisma.profileFact.deleteMany({ where: { userId } });
  await prisma.trunkEntry.deleteMany({ where: { userId } });
  await prisma.trunkSegment.deleteMany({ where: { userId } });

  await prisma.user.update({
    where: { id: userId },
    data: { lastReadingDeliveredAt: null },
  });
}

async function seedAlexPursuits(prisma: PrismaClient, userId: string): Promise<void> {
  await ensureTaxonomyCurrent(prisma, userId);
  await unlockThemesForUser(prisma, userId, ALEX_PROFILE.unlockThemes);
  await activateLimbsForUser(prisma, userId, ALEX_PROFILE.unlockThemes);

  const sequenceByCategory = new Map<string, number>();
  const activatedCategories = new Set<string>();

  for (const spec of ALEX_HONEST_PURSUITS) {
    const categoryId = await findSystemCategory(prisma, userId, spec.themeId, spec.categoryLabel);
    if (!activatedCategories.has(categoryId)) {
      await activateCategoryForUser(prisma, userId, categoryId);
      activatedCategories.add(categoryId);
    }

    const seq = sequenceByCategory.get(categoryId) ?? 0;
    sequenceByCategory.set(categoryId, seq + 1);
    await insertPursuit(prisma, userId, spec, categoryId, seq);
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient(
    process.env.DIRECT_URL?.trim()
      ? { datasources: { db: { url: process.env.DIRECT_URL.trim() } } }
      : undefined,
  );

  try {
    const user = await prisma.user.findUnique({
      where: { email: ALEX_EMAIL },
      select: { id: true, email: true },
    });
    if (!user) {
      console.error(`User not found: ${ALEX_EMAIL}. Run npm run seed:ai-qa first.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Reseeding ${ALEX_EMAIL} (${user.id})…`);
    await wipeAlexMapContent(prisma, user.id);
    await seedAlexPursuits(prisma, user.id);

    const [goalCount, insightCount, storyCount, nonEmptyDesc] = await Promise.all([
      prisma.goal.count({ where: { userId: user.id, archived: false } }),
      prisma.insightCache.count({ where: { userId: user.id } }),
      prisma.storyCache.count({ where: { userId: user.id } }),
      prisma.goal.count({
        where: { userId: user.id, archived: false, NOT: { description: "" } },
      }),
    ]);

    const byTheme = new Map<string, number>();
    const goals = await prisma.goal.findMany({
      where: { userId: user.id, archived: false },
      select: { themeId: true, title: true, description: true },
      orderBy: { createdAt: "asc" },
    });
    for (const g of goals) {
      const label = themeLabel((g.themeId ?? "becoming") as Parameters<typeof themeLabel>[0]);
      byTheme.set(label, (byTheme.get(label) ?? 0) + 1);
    }

    console.log("\n=== Verification ===");
    console.log(`Goals (archived=false): ${goalCount} (expected 17)`);
    console.log(`InsightCache rows: ${insightCount} (expected 0)`);
    console.log(`StoryCache rows: ${storyCount} (expected 0)`);
    console.log(`Non-empty descriptions: ${nonEmptyDesc} (expected 3)`);
    console.log("By theme:");
    for (const [theme, count] of [...byTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }
    console.log("  Play & Leisure: 0 (empty by design)");
    console.log("\nDescriptions populated:");
    for (const g of goals.filter((row) => row.description.trim())) {
      console.log(`  • ${g.title}: "${g.description}"`);
    }

    const ok =
      goalCount === 17 && insightCount === 0 && storyCount === 0 && nonEmptyDesc === 3;
    if (!ok) {
      console.error("\nVerification FAILED — check counts above.");
      process.exitCode = 1;
    } else {
      console.log("\nReseed OK. Trigger Update AI reading on device to test voice fix.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
