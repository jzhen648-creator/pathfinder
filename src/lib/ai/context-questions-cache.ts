import crypto from "crypto";

import type { FormattedPursuitContext } from "@/lib/ai/format-map-context";
import { prisma } from "@/lib/prisma";

const CACHE_PREFIX = "ctxq:";

export function contextQuestionsContentHash(
  pursuitContext: FormattedPursuitContext,
  userContext: string,
): string {
  const payload = JSON.stringify({
    pursuitContext,
    userContext: userContext.trim(),
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function cacheInputHash(goalId: string, contentHash: string): string {
  return `${CACHE_PREFIX}${goalId}:${contentHash}`;
}

export async function readCachedContextQuestions(
  userId: string,
  goalId: string,
  contentHash: string,
): Promise<string[] | null> {
  const row = await prisma.goalEvaluationCache.findUnique({
    where: {
      userId_inputHash: {
        userId,
        inputHash: cacheInputHash(goalId, contentHash),
      },
    },
    select: { evaluation: true },
  });
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.evaluation) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return null;
    const questions = parsed.questions
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter(Boolean);
    return questions.length >= 2 ? questions : null;
  } catch {
    return null;
  }
}

export async function writeCachedContextQuestions(
  userId: string,
  goalId: string,
  contentHash: string,
  questions: string[],
): Promise<void> {
  const trimmed = questions.map((q) => q.trim()).filter(Boolean);
  if (trimmed.length < 2) return;

  await prisma.goalEvaluationCache.upsert({
    where: {
      userId_inputHash: {
        userId,
        inputHash: cacheInputHash(goalId, contentHash),
      },
    },
    create: {
      userId,
      inputHash: cacheInputHash(goalId, contentHash),
      evaluation: JSON.stringify({ questions: trimmed }),
    },
    update: {
      evaluation: JSON.stringify({ questions: trimmed }),
    },
  });
}

/** Drop cached questions when pursuit context is filled or pursuit metadata changes. */
export async function clearContextQuestionsCache(
  userId: string,
  goalId: string,
): Promise<void> {
  await prisma.goalEvaluationCache.deleteMany({
    where: {
      userId,
      inputHash: { startsWith: `${CACHE_PREFIX}${goalId}:` },
    },
  });
}
