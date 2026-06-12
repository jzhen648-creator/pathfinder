/**
 * Run People connection-framing scenarios via runStreamExtract / runStreamThemeExtract
 * (same code path as POST /api/stream/extract, without HTTP).
 *
 * Run: npx tsx scripts/run-people-connection-extract.ts
 * Requires: GEMINI_API_KEY, dev user map (jzhen648@gmail.com)
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";
import { formatMapContext } from "../src/lib/ai/format-map-context";
import { formatUserContext } from "../src/lib/ai/format-user-context";
import {
  buildStreamHubContextInput,
  formatPreviousStreamSessionSummary,
  runStreamExtract,
  runStreamThemeExtract,
} from "../src/lib/ai/stream-extract";
import { buildStreamThemeContextInput } from "../src/lib/stream-theme-context";
import { hasGeminiKey } from "../src/lib/gemini";
import { resolveDevLoginEmail } from "../src/lib/dev-login-credentials";
import type { LifeAreaId } from "../src/lib/types";

const prisma = new PrismaClient();
const DELAY_MS = Number(process.env.EXTRACT_DELAY_MS ?? "12000");

const SCENARIOS = [
  {
    id: "people-james-friendships",
    mode: "hub" as const,
    hubSlug: "friendships",
    input:
      "James has been one of my closest friends since uni. We haven't spoken much lately and I want to change that. Planning to visit him in Manchester next month.",
  },
  {
    id: "people-mum-family",
    mode: "hub" as const,
    hubSlug: "family",
    input:
      "I need to be better at calling my mum. She's getting older and I don't want to regret not spending more time with her.",
  },
  {
    id: "people-sarah-romance",
    mode: "hub" as const,
    hubSlug: "romance",
    input:
      "Sarah and I have been together three years. We've been talking about moving in together and I want to make that happen this year.",
  },
  {
    id: "people-community-friendships",
    mode: "theme" as const,
    input:
      "I want to get more involved in my local area in London. Maybe join a running club or volunteer somewhere.",
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadHubContext(userId: string, hubSlug: string) {
  const branches = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null, themeId: "people" },
    select: { id: true, themeId: true, label: true, name: true },
  });
  const { systemHubKey } = await import("../src/lib/system-categories");
  const match = branches.find(
    (b) => systemHubKey(b.themeId, b.label ?? b.name).split("::")[1] === hubSlug,
  );
  if (!match) throw new Error(`Hub not found: people::${hubSlug}`);

  const [goals, archivedGoals, marks, archivedMarks, recentStreamMarks] = await Promise.all([
    prisma.goal.findMany({
      where: {
        userId,
        categoryId: match.id,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
      },
      select: {
        id: true,
        title: true,
        goalType: true,
        status: true,
        parentGoalId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goal.findMany({
      where: {
        userId,
        categoryId: match.id,
        archived: true,
        goalType: { notIn: ["moment", "event"] },
      },
      select: { title: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mark.findMany({
      where: { userId, categoryId: match.id, archived: false },
      select: { title: true, date: true },
      orderBy: { date: "asc" },
    }),
    prisma.mark.findMany({
      where: { userId, categoryId: match.id, archived: true },
      select: { title: true, date: true },
      orderBy: { date: "desc" },
    }),
    prisma.mark.findMany({
      where: { userId, categoryId: match.id, archived: false, kind: "stream" },
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return buildStreamHubContextInput({
    categoryId: match.id,
    themeId: match.themeId,
    hubLabel: match.label ?? match.name ?? hubSlug,
    existingPursuits: goals.map((g) => ({
      goalId: g.id,
      title: g.title,
      goalType: g.goalType,
      status: g.status,
      parentGoalId: g.parentGoalId ?? null,
    })),
    existingMarks: marks.map((m) => ({
      title: m.title,
      date: m.date.toISOString().slice(0, 10),
    })),
    removedPursuits: archivedGoals.map((g) => ({ title: g.title })),
    removedMarks: archivedMarks.map((m) => ({
      title: m.title,
      date: m.date.toISOString().slice(0, 10),
    })),
    previousStreamSessionSummary: formatPreviousStreamSessionSummary(
      [...recentStreamMarks].reverse().map((m) => m.title),
    ),
  });
}

function printExtraction(id: string, result: Awaited<ReturnType<typeof runStreamExtract>>) {
  console.log(`\n=== ${id} ===`);
  console.log(`narrative: ${result.narrativeSentence}`);
  for (const p of result.pursuits) {
    const hub = "hubId" in p ? (p as { hubId?: string }).hubId : undefined;
    console.log(
      `  pursuit | hub=${hub ?? "(hub-scoped)"} | ${p.existingGoalId ? "existing" : "new"} | "${p.title}"`,
    );
  }
  for (const m of result.milestones) {
    console.log(`  milestone | hub=${m.hubId ?? "(hub-scoped)"} | "${m.title}"`);
  }
  for (const m of result.marks) {
    console.log(`  mark | hub=${m.hubId ?? "(hub-scoped)"} | "${m.title}"`);
  }
  for (const a of result.ambiguous) {
    console.log(`  ambiguous | hub=${a.hubId ?? "?"} | "${a.label}" (${a.confidence})`);
  }
}

async function main() {
  if (!hasGeminiKey()) {
    console.error("GEMINI_API_KEY not configured");
    process.exitCode = 1;
    return;
  }

  const email = resolveDevLoginEmail();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exitCode = 1;
    return;
  }

  const [userContext, mapContext] = await Promise.all([
    formatUserContext(user.id),
    formatMapContext(user.id),
  ]);

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i]!;
    if (i > 0) await sleep(DELAY_MS);

    try {
      if (scenario.mode === "hub") {
        const hubContext = await loadHubContext(user.id, scenario.hubSlug!);
        const result = await runStreamExtract(hubContext, scenario.input, {
          userContext,
          mapContext: await formatMapContext(user.id, {
            themeId: "people",
            hubId: hubContext.categoryId,
          }),
        });
        printExtraction(scenario.id, result);
      } else {
        const themeContext = await buildStreamThemeContextInput(
          prisma,
          user.id,
          "people",
          scenario.input,
        );
        if (!themeContext) throw new Error("Theme context missing");
        const result = await runStreamThemeExtract(themeContext, scenario.input, {
          userContext,
          mapContext,
        });
        printExtraction(scenario.id, result);
      }
    } catch (err) {
      console.error(`\n=== ${scenario.id} FAILED ===`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
