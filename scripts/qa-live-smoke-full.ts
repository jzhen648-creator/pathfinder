/**
 * Layer 4 full-story smoke — stale caches + dirty ledger, then one live ai-sync.
 * Usage: QA_SMOKE_BASE_URL=... npm run qa:live-smoke:full
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

import {
  markGlobalReadingDirty,
  markPursuitReadingDirty,
} from "../src/lib/map/reading-dirty-ledger";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const FINDINGS_PATH = path.join(ROOT, "QA-FINDINGS.md");
const BASE = (process.env.QA_SMOKE_BASE_URL ?? "https://pathfinder-xi-rust.vercel.app").replace(/\/$/, "");
const EMAIL = process.env.QA_SMOKE_EMAIL ?? "alex@qa-seed.test";
const PASSWORD = process.env.QA_SEED_PASSWORD ?? "pathfinder-qa";

const prisma = new PrismaClient();

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("missing token");
  return body.token;
}

async function prepareFullStorySmoke(userId: string): Promise<void> {
  const staleVersion = `stale-smoke-${Date.now()}`;
  await Promise.all([
    prisma.storyCache.updateMany({
      where: { userId },
      data: { mapVersion: staleVersion, memoryVersion: 0 },
    }),
    prisma.insightCache.updateMany({
      where: { userId },
      data: { mapVersion: staleVersion, memoryVersion: 0 },
    }),
  ]);

  const pursuits = await prisma.goal.findMany({
    where: { userId, archived: false, goalType: { notIn: ["moment", "event"] } },
    select: { id: true, title: true },
    take: 3,
    orderBy: { updatedAt: "desc" },
  });

  for (const pursuit of pursuits) {
    await markPursuitReadingDirty(userId, pursuit.id, "full_story_smoke");
  }
  await markGlobalReadingDirty(userId, "full_story_smoke");

  console.log(
    "prepared:",
    pursuits.map((p) => p.title).join(", "),
    `(staleVersion=${staleVersion})`,
  );
}

function appendFindingRow(notes: string, calls: number, ok: boolean) {
  const row = `| ${new Date().toISOString().slice(0, 10)} | ${EMAIL} | full-story | ${calls} | ${ok ? "pass" : "fail"} | ${notes} |`;
  if (!fs.existsSync(FINDINGS_PATH)) return;
  const content = fs.readFileSync(FINDINGS_PATH, "utf8");
  const marker = "| _ex_ 2026-06-15 | seed-1 | full | 2 | pass | story+panels refreshed, within budget |";
  if (content.includes(marker)) {
    fs.writeFileSync(FINDINGS_PATH, content.replace(marker, `${row}\n${marker}`));
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log("qa-live-smoke:full — skipped (GEMINI_API_KEY not in .env.local)");
    process.exit(0);
  }

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`user missing: ${EMAIL}`);

  await prepareFullStorySmoke(user.id);
  const token = await login();

  const response = await fetch(`${BASE}/api/map/ai-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ force: true }),
  });

  const body = (await response.json()) as {
    ok?: boolean;
    skipped?: boolean;
    metrics?: { aiCallsCompleted?: number; reflectCall?: boolean; rateLimited?: boolean };
    story?: { refreshed?: boolean };
    insights?: { refreshed?: boolean };
  };

  const calls = body.metrics?.aiCallsCompleted ?? 0;
  const ok =
    response.ok &&
    !body.skipped &&
    calls >= 1 &&
    calls <= 2 &&
    body.metrics?.reflectCall === true &&
    body.story?.refreshed === true &&
    body.insights?.refreshed === true &&
    !body.metrics?.rateLimited;

  const summary = {
    status: response.status,
    skipped: body.skipped,
    aiCallsCompleted: calls,
    reflectCall: body.metrics?.reflectCall,
    rateLimited: body.metrics?.rateLimited,
    storyRefreshed: body.story?.refreshed,
    insightsRefreshed: body.insights?.refreshed,
    ok,
  };

  console.log("qa-live-smoke:full", summary);
  appendFindingRow(
    `story+panels; reflect=${body.metrics?.reflectCall}; rateLimited=${body.metrics?.rateLimited}`,
    calls,
    ok,
  );

  process.exit(ok ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
