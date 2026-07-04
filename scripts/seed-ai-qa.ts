/**
 * Repeatable AI QA seed — Alex Carter (rich map) + Sam Chen (sparse control).
 *
 * Optimized for the current mobile model:
 * - Goal.background (not legacy description-only)
 * - UserManualProfile.currencyCode + measurementSystem
 * - enrichAnswers, cross-theme PursuitRelationship, orientation ProfileFact
 * - amountBasis on quantified chapters
 * - Reading dirty ledger primed for first sync
 *
 * Run:
 *   npx tsx scripts/seed-ai-qa.ts
 *   npm run seed:ai-qa
 *
 * Requires DATABASE_URL (loads pathfinder/.env.local when present).
 * Idempotent: deletes and recreates only @qa-seed.test users.
 * No AI caches, Stream, or marks.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Fixed QA password — override with QA_SEED_PASSWORD env for local runs. */
const DEFAULT_QA_SEED_PASSWORD = "pathfinder-qa";

import { PrismaClient, type PursuitStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  ALEX_PROFILE,
  SAM_PROFILE,
  SEED_EMAILS,
  seedQaProfile,
  type PursuitSpec,
} from "./seed-ai-qa-data";
import {
  ALEX_ORIENTATION,
  ALEX_RELATIONSHIPS,
  ALEX_RICH_PURSUITS,
  SAM_SPARSE_PURSUITS,
} from "./seed-ai-qa-manifest";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host || "(unknown host)";
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

function resolveSeedPassword(): string {
  const fromEnv = process.env.QA_SEED_PASSWORD?.trim();
  return fromEnv || DEFAULT_QA_SEED_PASSWORD;
}

function countByStatus(pursuits: readonly PursuitSpec[]): Record<PursuitStatus, number> {
  const out: Record<string, number> = {};
  for (const p of pursuits) {
    out[p.status] = (out[p.status] ?? 0) + 1;
  }
  return out as Record<PursuitStatus, number>;
}

function countMilestones(pursuits: readonly PursuitSpec[]): {
  total: number;
  completed: number;
} {
  let total = 0;
  let completed = 0;
  for (const p of pursuits) {
    for (const m of p.milestones ?? []) {
      total += 1;
      if (m.completed) completed += 1;
    }
  }
  return { total, completed };
}

function countWithBackground(pursuits: readonly PursuitSpec[]): number {
  return pursuits.filter((p) => (p.background?.trim().length ?? 0) > 0).length;
}

async function main(): Promise<void> {
  loadEnvLocal();

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required (set in .env.local or environment).");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const password = resolveSeedPassword();
  const passwordHash = await bcrypt.hash(password, 12);

  console.log("Pathfinder AI QA seed (mobile-native v2)");
  console.log(`Database host: ${dbHost()}`);
  console.log(`Wiping seed users: ${SEED_EMAILS.join(", ")}`);

  const deleted = await prisma.user.deleteMany({
    where: { email: { in: [...SEED_EMAILS] } },
  });
  console.log(`Deleted ${deleted.count} existing seed user(s).\n`);

  try {
    const alex = await seedQaProfile(prisma, passwordHash, {
      ...ALEX_PROFILE,
      orientation: ALEX_ORIENTATION,
      pursuits: ALEX_RICH_PURSUITS,
      relationships: ALEX_RELATIONSHIPS,
    });
    const sam = await seedQaProfile(prisma, passwordHash, {
      ...SAM_PROFILE,
      pursuits: SAM_SPARSE_PURSUITS,
    });

    const alexMilestones = countMilestones(ALEX_RICH_PURSUITS);

    console.log("=== Alex Carter (rich showcase) ===");
    console.log(`Email: ${ALEX_PROFILE.email}`);
    console.log(`Chapters: ${ALEX_RICH_PURSUITS.length}`);
    for (const [theme, count] of [...alex.countsByTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }
    console.log(`  Play & Leisure: 0 (theme unlocked, no chapters — distribution skew)`);
    console.log(`Status mix: ${JSON.stringify(countByStatus(ALEX_RICH_PURSUITS))}`);
    console.log(
      `Milestones: ${alexMilestones.completed} completed / ${alexMilestones.total} total`,
    );
    console.log(`Background notes: ${countWithBackground(ALEX_RICH_PURSUITS)} chapters`);
    console.log(`Cross-theme links: ${ALEX_RELATIONSHIPS.length}`);
    console.log(`Orientation: ${ALEX_ORIENTATION}`);
    console.log(`Currency & units: GBP · metric`);
    console.log(`Gap anchor: CeMAP — sig 5, ~18d deadline, Module 3 open`);

    console.log("\n=== Sam Chen (sparse control) ===");
    console.log(`Email: ${SAM_PROFILE.email}`);
    console.log(`Chapters: ${SAM_SPARSE_PURSUITS.length}`);
    for (const [theme, count] of [...sam.countsByTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }

    console.log("\n=== Login (mobile: POST /api/auth/mobile-login) ===");
    console.log(`Password: ${password}`);
    console.log(`  ${ALEX_PROFILE.email}`);
    console.log(`  ${SAM_PROFILE.email}`);
    console.log("\nNext: Map tab → explore hex map. Reading tab → pull to refresh (live Gemini).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
