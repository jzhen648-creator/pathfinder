/**
 * Reseed Alex QA account — keeps login, wipes map/AI data, re-inserts v2 manifest.
 *
 * Run:
 *   npx tsx scripts/reseed-alex-qa.ts
 *   npm run reseed:alex-qa
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { getStreamSessionDelegate } from "../src/lib/prisma-stream-session";
import {
  ALEX_PROFILE,
  findSystemCategory,
  insertPursuit,
  themeLabel,
} from "./seed-ai-qa-data";
import {
  ALEX_ORIENTATION,
  ALEX_RELATIONSHIPS,
  ALEX_RICH_PURSUITS,
} from "./seed-ai-qa-manifest";
import {
  activateCategoryForUser,
  activateLimbsForUser,
} from "../src/lib/system-categories";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import { unlockThemesForUser } from "../src/lib/unlocked-themes";
import { markGlobalReadingDirty, markPursuitReadingDirty } from "../src/lib/map/reading-dirty-ledger";
import { ORIENTATION_FACT_KEY } from "../src/lib/ai/format-user-context";
import { normalizeRelationshipPair } from "../src/lib/pursuit/pursuit-context-log";

const ALEX_EMAIL = ALEX_PROFILE.email;
const EXPECTED_CHAPTER_COUNT = ALEX_RICH_PURSUITS.length;
const EXPECTED_BACKGROUND_COUNT = ALEX_RICH_PURSUITS.filter(
  (p) => (p.background?.trim().length ?? 0) > 0,
).length;
const EXPECTED_RELATIONSHIP_COUNT = ALEX_RELATIONSHIPS.length;

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
  await prisma.pursuitRelationship.deleteMany({ where: { userId } });
  await prisma.pursuitContextEntry.deleteMany({ where: { userId } });
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
    data: { lastReadingDeliveredAt: null, lastFullReflectAt: null },
  });
}

async function seedAlexContent(prisma: PrismaClient, userId: string): Promise<void> {
  await ensureTaxonomyCurrent(prisma, userId);
  await unlockThemesForUser(prisma, userId, ALEX_PROFILE.unlockThemes);
  await activateLimbsForUser(prisma, userId, ALEX_PROFILE.unlockThemes);

  await prisma.profileFact.create({
    data: {
      userId,
      category: "preferences",
      key: ORIENTATION_FACT_KEY,
      value: ALEX_ORIENTATION,
      source: "user_manual",
    },
  });

  const titleToId = new Map<string, string>();
  const sequenceByCategory = new Map<string, number>();
  const activatedCategories = new Set<string>();

  for (const spec of ALEX_RICH_PURSUITS) {
    const categoryId = await findSystemCategory(prisma, userId, spec.themeId, spec.categoryLabel);
    if (!activatedCategories.has(categoryId)) {
      await activateCategoryForUser(prisma, userId, categoryId);
      activatedCategories.add(categoryId);
    }

    const seq = sequenceByCategory.get(categoryId) ?? 0;
    sequenceByCategory.set(categoryId, seq + 1);
    const goalId = await insertPursuit(prisma, userId, spec, categoryId, seq);
    titleToId.set(spec.title, goalId);
  }

  for (const rel of ALEX_RELATIONSHIPS) {
    const idA = titleToId.get(rel.titleA);
    const idB = titleToId.get(rel.titleB);
    if (!idA || !idB) {
      throw new Error(`Relationship titles not found: ${rel.titleA} ↔ ${rel.titleB}`);
    }
    const [goalAId, goalBId] = normalizeRelationshipPair(idA, idB);
    await prisma.pursuitRelationship.create({
      data: {
        userId,
        goalAId,
        goalBId,
        kind: "related",
        label: rel.label ?? null,
      },
    });
  }

  await markGlobalReadingDirty(userId, "qa_reseed");
  for (const goalId of titleToId.values()) {
    await markPursuitReadingDirty(userId, goalId, "qa_reseed");
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
    await seedAlexContent(prisma, user.id);

    const [goalCount, insightCount, backgroundCount, relationshipCount, enrichCount] =
      await Promise.all([
        prisma.goal.count({ where: { userId: user.id, archived: false } }),
        prisma.insightCache.count({ where: { userId: user.id } }),
        prisma.goal.count({
          where: {
            userId: user.id,
            archived: false,
            background: { not: null },
            NOT: { background: "" },
          },
        }),
        prisma.pursuitRelationship.count({ where: { userId: user.id } }),
        prisma.goal.count({
          where: { userId: user.id, archived: false, enrichAnswers: { not: null } },
        }),
      ]);

    const byTheme = new Map<string, number>();
    const goals = await prisma.goal.findMany({
      where: { userId: user.id, archived: false },
      select: { themeId: true, title: true, background: true },
      orderBy: { createdAt: "asc" },
    });
    for (const g of goals) {
      const label = themeLabel((g.themeId ?? "becoming") as Parameters<typeof themeLabel>[0]);
      byTheme.set(label, (byTheme.get(label) ?? 0) + 1);
    }

    console.log("\n=== Verification ===");
    console.log(`Chapters: ${goalCount} (expected ${EXPECTED_CHAPTER_COUNT})`);
    console.log(`Background notes: ${backgroundCount} (expected ${EXPECTED_BACKGROUND_COUNT})`);
    console.log(`Cross-theme links: ${relationshipCount} (expected ${EXPECTED_RELATIONSHIP_COUNT})`);
    console.log(`Chapters with enrichAnswers: ${enrichCount} (expected 2)`);
    console.log(`InsightCache rows: ${insightCount} (expected 0)`);
    console.log("By theme:");
    for (const [theme, count] of [...byTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }
    console.log("\nBackground populated:");
    for (const g of goals.filter((row) => row.background?.trim())) {
      console.log(`  • ${g.title}: "${g.background!.trim()}"`);
    }

    const ok =
      goalCount === EXPECTED_CHAPTER_COUNT &&
      backgroundCount === EXPECTED_BACKGROUND_COUNT &&
      relationshipCount === EXPECTED_RELATIONSHIP_COUNT &&
      enrichCount === 2 &&
      insightCount === 0;

    if (!ok) {
      console.error("\nVerification FAILED — check counts above.");
      process.exitCode = 1;
    } else {
      console.log("\nReseed OK. Open Map + Reading tab on device.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
