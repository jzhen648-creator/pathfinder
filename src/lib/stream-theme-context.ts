import type { PrismaClient, StreamInputMode } from "@prisma/client";

import { formatPreviousStreamSessionDumps } from "@/lib/ai/stream-extract";

import { categoryPanelCopy, parseCategoryRedirectTarget } from "@/lib/category-catalog";

import { getLifeArea } from "@/lib/life-areas";

import { getStreamSessionDelegate } from "@/lib/prisma-stream-session";

import { resolveAllHubBranchesForTheme } from "@/lib/resolve-category";

import type { LifeAreaId } from "@/lib/types";

import type {
  StreamSessionCommitFields,
  StreamThemeCategoryContextInput,
  StreamThemeContextInput,
} from "@/types/stream";

const HUB_INFERENCE_STOP_WORDS = new Set([
  "about",
  "after",
  "belong",
  "building",
  "career",
  "clearly",
  "daily",
  "different",
  "goals",
  "growth",
  "hub",
  "life",
  "matters",
  "money",
  "outcome",
  "plans",
  "practice",
  "route",
  "separate",
  "theme",
  "thing",
  "things",
  "track",
  "user",
  "when",
  "where",
  "work",
  "your",
]);
const HUB_INFERENCE_SHORT_TOKENS = new Set(["isa", "sql", "aws", "bupa"]);

function normalizeForHubInference(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&+£$]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripRedirectHint(value: string): string {
  return value.replace(/\(→\s*[^)]+\)\s*$/u, "").trim();
}

function hubInferenceTokens(value: string): string[] {
  const normalized = normalizeForHubInference(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => {
      if (HUB_INFERENCE_STOP_WORDS.has(token)) return false;
      return token.length >= 4 || HUB_INFERENCE_SHORT_TOKENS.has(token) || /^[£$]?\d/.test(token);
    });
}

function phraseMatches(input: string, phrase: string): boolean {
  const normalized = normalizeForHubInference(stripRedirectHint(phrase));
  return normalized.length >= 4 && input.includes(normalized);
}

function scoreHubFromCatalog(input: string, themeId: LifeAreaId, hubLabel: string): number {
  const copy = categoryPanelCopy(themeId, hubLabel);
  const hubKey = normalizeForHubInference(hubLabel);
  let score = 0;

  if (hubKey && input.includes(hubKey)) score += 8;

  for (const phrase of [...copy.belongsHere, ...copy.examples]) {
    if (phraseMatches(input, phrase)) score += 6;
  }

  for (const phrase of [copy.about, copy.aiRoutingNote, ...copy.belongsHere, ...copy.examples]) {
    const uniqueTokens = new Set(hubInferenceTokens(phrase));
    for (const token of uniqueTokens) {
      if (input.includes(token)) score += 2;
    }
  }

  for (const phrase of copy.doesNotBelongHere) {
    if (phraseMatches(input, phrase) || hubInferenceTokens(stripRedirectHint(phrase)).some((token) => input.includes(token))) {
      score -= parseCategoryRedirectTarget(phrase) ? 2 : 1;
    }
  }

  return score;
}

export function inferLikelyThemeHubSlugs(inputText: string, themeId: LifeAreaId, hubLabels: string[]): Set<string> {
  const input = normalizeForHubInference(inputText);
  if (!input) return new Set();

  const scored = hubLabels
    .map((hubLabel) => ({
      hubLabel,
      slug: normalizeForHubInference(hubLabel),
      score: scoreHubFromCatalog(input, themeId, hubLabel),
    }))
    .filter((row) => row.score >= 4);

  return new Set(scored.map((row) => row.slug));
}

/** Highest catalog score for a theme (0 if no hub matches). */
export function bestHubScoreForThemeInput(
  inputText: string,
  themeId: LifeAreaId,
  hubLabels: string[],
): number {
  const input = normalizeForHubInference(inputText);
  if (!input) return 0;

  let best = 0;
  for (const hubLabel of hubLabels) {
    best = Math.max(best, scoreHubFromCatalog(input, themeId, hubLabel));
  }
  return best;
}

/** Highest-scoring hub slug for pre-LLM routing hints (score >= 4), or null. */
export function pickBestHubSlugForThemeInput(
  inputText: string,
  themeId: LifeAreaId,
  hubLabels: string[],
): string | null {
  const input = normalizeForHubInference(inputText);
  if (!input) return null;

  let best: { slug: string; score: number } | null = null;
  for (const hubLabel of hubLabels) {
    const score = scoreHubFromCatalog(input, themeId, hubLabel);
    const slug = normalizeForHubInference(hubLabel);
    if (score < 4) continue;
    if (!best || score > best.score) best = { slug, score };
  }
  return best?.slug ?? null;
}

function fallbackRecentThemeHubs<T extends { updatedAt?: Date }>(hubs: T[], limit = 2): T[] {
  return [...hubs]
    .sort((a, b) => {
      const aTime = a.updatedAt?.getTime() ?? 0;
      const bTime = b.updatedAt?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

/** Load inferred theme hubs with pursuits, marks, and prior session dumps for extract. */
export async function buildStreamThemeContextInput(
  prisma: PrismaClient,
  userId: string,
  themeId: LifeAreaId,
  inputText?: string,
): Promise<StreamThemeContextInput | null> {
  const resolved = await resolveAllHubBranchesForTheme(prisma, userId, themeId);

  if (resolved.length === 0) return null;

  const inferredHubSlugs = inferLikelyThemeHubSlugs(
    inputText ?? "",
    themeId,
    resolved.map((h) => h.hubLabel),
  );
  const scopedResolved =
    inferredHubSlugs.size > 0
      ? resolved.filter((h) => inferredHubSlugs.has(h.hubSlug))
      : fallbackRecentThemeHubs(resolved);
  const branchIds = scopedResolved.map((h) => h.categoryId);

  const streamSession = getStreamSessionDelegate(prisma);

  const sessionQuery = streamSession
    ? streamSession
        .findMany({
          where: { userId, themeId: themeId },
          select: { inputText: true, inputMode: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
        .catch((err) => {
          console.warn("[buildStreamThemeContextInput] StreamSession query failed", err);
          return [] as Array<{ inputText: string; inputMode: StreamInputMode; createdAt: Date }>;
        })
    : Promise.resolve([]);

  const [goals, archivedGoals, marks, archivedMarks, recentSessions] = await Promise.all([
    prisma.goal.findMany({
      where: {
        userId,
        categoryId: { in: branchIds },
        archived: false,
        goalType: { notIn: ["moment", "event"] },
      },
      select: {
        id: true,
        categoryId: true,
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
        categoryId: { in: branchIds },
        archived: true,
        goalType: { notIn: ["moment", "event"] },
      },
      select: { categoryId: true, title: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mark.findMany({
      where: { userId, categoryId: { in: branchIds }, archived: false },
      select: { categoryId: true, title: true, date: true },
      orderBy: { date: "asc" },
    }),
    prisma.mark.findMany({
      where: { userId, categoryId: { in: branchIds }, archived: true },
      select: { categoryId: true, title: true, date: true },
      orderBy: { date: "desc" },
    }),
    sessionQuery,
  ]);

  const goalsByCategory = new Map<string, StreamThemeCategoryContextInput["existingPursuits"]>();
  const removedGoalsByCategory = new Map<string, StreamThemeCategoryContextInput["removedPursuits"]>();
  for (const id of branchIds) {
    goalsByCategory.set(id, []);
    removedGoalsByCategory.set(id, []);
  }
  for (const g of goals) {
    if (!g.categoryId) continue;
    goalsByCategory.get(g.categoryId)?.push({
      goalId: g.id,
      title: g.title,
      goalType: g.goalType,
      status: g.status,
      parentGoalId: g.parentGoalId ?? null,
    });
  }
  for (const g of archivedGoals) {
    if (!g.categoryId) continue;
    removedGoalsByCategory.get(g.categoryId)?.push({ title: g.title });
  }

  const marksByCategory = new Map<string, StreamThemeCategoryContextInput["existingMarks"]>();
  const removedMarksByCategory = new Map<string, StreamThemeCategoryContextInput["removedMarks"]>();
  for (const id of branchIds) {
    marksByCategory.set(id, []);
    removedMarksByCategory.set(id, []);
  }
  for (const m of marks) {
    marksByCategory.get(m.categoryId)?.push({
      title: m.title,
      ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
    });
  }
  for (const m of archivedMarks) {
    removedMarksByCategory.get(m.categoryId)?.push({
      title: m.title,
      ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
    });
  }

  const categories: StreamThemeCategoryContextInput[] = scopedResolved.map((h) => {
    const copy = categoryPanelCopy(themeId, h.hubLabel);
    return {
      categorySlug: h.hubSlug,
      categoryLabel: h.hubLabel,
      about: copy.about,
      aiRoutingNote: copy.aiRoutingNote,
      belongsHere: copy.belongsHere,
      doesNotBelongHere: copy.doesNotBelongHere,
      examples: copy.examples,
      branchId: h.categoryId,
      existingPursuits: goalsByCategory.get(h.categoryId) ?? [],
      existingMarks: marksByCategory.get(h.categoryId) ?? [],
      removedPursuits: removedGoalsByCategory.get(h.categoryId) ?? [],
      removedMarks: removedMarksByCategory.get(h.categoryId) ?? [],
    };
  });

  const themeName = getLifeArea(themeId)?.label ?? themeId;
  const chronologicalSessions = [...recentSessions].reverse().map((s) => ({
    inputText: s.inputText,
    inputMode: s.inputMode,
    createdAt: s.createdAt,
  }));

  return {
    themeId,
    themeName,
    categories,
    previousThemeSessionContext: formatPreviousStreamSessionDumps(chronologicalSessions),
  };
}

/** Persist theme Stream session after successful commit (fail-safe; outside tree transaction). */
/** Persist global FAB Stream session (limbId = "global"). */
export async function recordStreamGlobalSession(
  prisma: PrismaClient,
  userId: string,
  fields: StreamSessionCommitFields,
): Promise<void> {
  await recordStreamThemeSession(prisma, userId, "global", fields);
}

export async function recordStreamThemeSession(
  prisma: PrismaClient,
  userId: string,
  themeId: string,
  fields: StreamSessionCommitFields,
): Promise<void> {
  const streamSession = getStreamSessionDelegate(prisma);
  if (!streamSession) {
    console.warn(
      "[recordStreamThemeSession] Prisma client missing streamSession — run npx prisma generate and restart the dev server",
    );
    return;
  }
  try {
    await streamSession.create({
      data: {
        userId,
        themeId: themeId,
        inputText: fields.inputText,
        inputMode: fields.inputMode,
        itemsAdded: fields.itemsAdded,
        itemsSkipped: fields.itemsSkipped,
      },
    });
  } catch (err) {
    console.warn("[recordStreamThemeSession] could not persist session", err);
  }
}
