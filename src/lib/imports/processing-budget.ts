import type { Prisma } from "@prisma/client";
import { DEFAULT_IMPORT_SEGMENT_CHARACTERS } from "@/lib/imports/segmentation";

/**
 * Import processing calls a model once per segment, so cost scales with pasted
 * volume. Nothing else bounds it: a guest account is free to create and a
 * source can be pasted repeatedly. These limits make the endpoint safe to
 * expose before any usage exists to tune them against.
 *
 * They are deliberately generous for real use and tight against abuse. A long
 * AI conversation is typically 20,000-40,000 characters; a deep-import Snapshot
 * 15,000-25,000.
 */

/** Roughly 30 segments. Was 500,000, which allowed 125 model calls per paste. */
export const MAX_IMPORT_SOURCE_CHARACTERS = 120_000;

/** Belt and braces if segment sizing ever changes. */
export const MAX_SEGMENTS_PER_SOURCE = Math.ceil(
  MAX_IMPORT_SOURCE_CHARACTERS / DEFAULT_IMPORT_SEGMENT_CHARACTERS,
);

export const PROCESSING_WINDOW_HOURS = 24;
export const MAX_PROCESSING_RUNS_PER_WINDOW = 20;

/** The control that actually bounds spend, since cost tracks segments. */
export const MAX_SEGMENTS_PER_WINDOW = 150;

export type ProcessingUsage = {
  runsInWindow: number;
  segmentsInWindow: number;
};

export type ProcessingBudgetDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "SOURCE_TOO_LARGE" | "TOO_MANY_RUNS" | "SEGMENT_BUDGET_EXHAUSTED";
      retryAfterHours: number | null;
      message: string;
    };

/**
 * Pure budget decision. Kept separate from the database so every branch is
 * testable without one, and so the numbers can be reasoned about directly.
 */
export function planProcessingBudget(input: {
  segmentCount: number;
  usage: ProcessingUsage;
}): ProcessingBudgetDecision {
  if (input.segmentCount > MAX_SEGMENTS_PER_SOURCE) {
    return {
      allowed: false,
      code: "SOURCE_TOO_LARGE",
      retryAfterHours: null,
      message:
        "This source is too long to process in one go. Split it into smaller parts and bring them in separately.",
    };
  }

  if (input.usage.runsInWindow >= MAX_PROCESSING_RUNS_PER_WINDOW) {
    return {
      allowed: false,
      code: "TOO_MANY_RUNS",
      retryAfterHours: PROCESSING_WINDOW_HOURS,
      message: "You have brought in a lot today. Please try again tomorrow.",
    };
  }

  if (input.usage.segmentsInWindow + input.segmentCount > MAX_SEGMENTS_PER_WINDOW) {
    return {
      allowed: false,
      code: "SEGMENT_BUDGET_EXHAUSTED",
      retryAfterHours: PROCESSING_WINDOW_HOURS,
      message: "You have brought in a lot today. Please try again tomorrow.",
    };
  }

  return { allowed: true };
}

export type ProcessingUsageDbClient = Pick<Prisma.TransactionClient, "importJob">;

/**
 * Count processing runs and segments started for this user inside the window.
 * Counted from jobs rather than sources so a repeated retry of one source still
 * consumes budget.
 */
export async function loadProcessingUsage(
  db: ProcessingUsageDbClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProcessingUsage> {
  const since = new Date(now.getTime() - PROCESSING_WINDOW_HOURS * 60 * 60 * 1000);
  const jobs = await db.importJob.findMany({
    where: { source: { userId }, createdAt: { gte: since } },
    select: { _count: { select: { segments: true } } },
  });
  return {
    runsInWindow: jobs.length,
    segmentsInWindow: jobs.reduce((sum, job) => sum + job._count.segments, 0),
  };
}
