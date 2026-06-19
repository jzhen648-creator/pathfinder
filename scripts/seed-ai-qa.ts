/**
 * Repeatable AI QA seed — Alex Carter (17 pursuits, honest descriptions) + Sam Chen (sparse control).
 *
 * Run:
 *   npx tsx scripts/seed-ai-qa.ts
 *   npm run seed:ai-qa
 *
 * Requires DATABASE_URL (loads pathfinder/.env.local when present).
 * Idempotent: deletes and recreates only @qa-seed.test users.
 * No AI, Stream, or marks.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Fixed QA password — override with QA_SEED_PASSWORD env for local runs. */
const DEFAULT_QA_SEED_PASSWORD = "pathfinder-qa";

import { PrismaClient, type PursuitStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  activateCategoryForUser,
  activateLimbsForUser,
} from "../src/lib/system-categories";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import { unlockThemesForUser } from "../src/lib/unlocked-themes";
import { ALEX_HONEST_PURSUITS } from "./alex-reseed-pursuits";
import {
  ALEX_PROFILE,
  SAM_PROFILE,
  SEED_EMAILS,
  dateOfBirthForAge,
  findSystemCategory,
  insertPursuit,
  themeLabel,
  type PursuitSpec,
} from "./seed-ai-qa-data";

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

type ProfileConfig = {
  email: string;
  displayName: string;
  age: number;
  location: string;
  educationLevel?: string | null;
  employmentStatus?: string | null;
  industry?: string | null;
  jobTitle?: string | null;
  unlockThemes: readonly PursuitSpec["themeId"][];
  pursuits: readonly PursuitSpec[];
};

async function seedProfile(
  prisma: PrismaClient,
  passwordHash: string,
  profile: ProfileConfig,
): Promise<{ userId: string; countsByTheme: Map<string, number> }> {
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.displayName,
      passwordHash,
      birthYear: new Date().getUTCFullYear() - profile.age,
      birthPlace: profile.location,
      onboardingCompleted: true,
      firstRunCompleted: true,
      unlockedLimbIds: [],
    },
  });

  await ensureTaxonomyCurrent(prisma, user.id);
  await unlockThemesForUser(prisma, user.id, profile.unlockThemes);
  await activateLimbsForUser(prisma, user.id, profile.unlockThemes);

  await prisma.userManualProfile.create({
    data: {
      userId: user.id,
      displayName: profile.displayName,
      dateOfBirth: dateOfBirthForAge(profile.age),
      location: profile.location,
      educationLevel: profile.educationLevel ?? null,
      employmentStatus: profile.employmentStatus ?? null,
      industry: profile.industry ?? null,
      jobTitle: profile.jobTitle ?? null,
      occupation: profile.jobTitle ?? null,
    },
  });

  const countsByTheme = new Map<string, number>();
  const sequenceByCategory = new Map<string, number>();
  const activatedCategories = new Set<string>();

  for (const spec of profile.pursuits) {
    const categoryId = await findSystemCategory(
      prisma,
      user.id,
      spec.themeId,
      spec.categoryLabel,
    );
    if (!activatedCategories.has(categoryId)) {
      await activateCategoryForUser(prisma, user.id, categoryId);
      activatedCategories.add(categoryId);
    }

    const seq = sequenceByCategory.get(categoryId) ?? 0;
    sequenceByCategory.set(categoryId, seq + 1);

    await insertPursuit(prisma, user.id, spec, categoryId, seq);

    const label = themeLabel(spec.themeId);
    countsByTheme.set(label, (countsByTheme.get(label) ?? 0) + 1);
  }

  return { userId: user.id, countsByTheme };
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

  console.log("Pathfinder AI QA seed");
  console.log(`Database host: ${dbHost()}`);
  console.log(`Wiping seed users: ${SEED_EMAILS.join(", ")}`);

  const deleted = await prisma.user.deleteMany({
    where: { email: { in: [...SEED_EMAILS] } },
  });
  console.log(`Deleted ${deleted.count} existing seed user(s).\n`);

  try {
    const alex = await seedProfile(prisma, passwordHash, {
      ...ALEX_PROFILE,
      pursuits: ALEX_HONEST_PURSUITS,
    });
    const sam = await seedProfile(prisma, passwordHash, SAM_PROFILE);

    const samMilestones = countMilestones(SAM_PROFILE.pursuits);

    console.log("=== Alex Carter (honest-description QA map) ===");
    console.log(`Email: ${ALEX_PROFILE.email}`);
    console.log(`Pursuits: ${ALEX_HONEST_PURSUITS.length}`);
    for (const [theme, count] of [...alex.countsByTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }
    console.log(`  Play & Leisure: 0 (empty by design)`);
    console.log(`Status mix: ${JSON.stringify(countByStatus(ALEX_HONEST_PURSUITS))}`);
    console.log(
      `Milestones: ${countMilestones(ALEX_HONEST_PURSUITS).completed} completed / ${countMilestones(ALEX_HONEST_PURSUITS).total} total`,
    );
    console.log(`Gap anchor: CeMAP qualification — sig 5, Module 3 exam open`);

    console.log("\n=== Sam Chen (sparse control) ===");
    console.log(`Email: ${SAM_PROFILE.email}`);
    console.log(`Pursuits: ${SAM_PROFILE.pursuits.length}`);
    for (const [theme, count] of [...sam.countsByTheme.entries()].sort()) {
      console.log(`  ${theme}: ${count}`);
    }
    console.log(`Milestones: ${samMilestones.total}`);

    console.log("\n=== Login (mobile: POST /api/auth/mobile-login) ===");
    console.log(`Password: ${password}`);
    console.log(`  ${ALEX_PROFILE.email}`);
    console.log(`  ${SAM_PROFILE.email}`);
    console.log("\n§5 gate: login → Insights → Update AI reading (live Gemini).");
    console.log("  Mobile: EXPO_PUBLIC_USE_REFLECT_CALL=true; npx expo start --clear");
    console.log("  Alex: expect room for Distribution + Gap + Arrival.");
    console.log("  Sam: expect short factual reading; no arrival/distribution padding.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
