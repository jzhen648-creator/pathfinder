import type { Prisma } from "@prisma/client";

/**
 * Import processing calls a model once per segment, so cost scales with pasted
 * volume. Nothing else bounds it across time: a guest account is free to create
 * and a source can be processed repeatedly.
 *
 * What this does **not** do is limit how much a person may paste. A single run
 * already processes at most `DEFAULT_IMPORT_SEGMENTS_PER_RUN` segments and
 * returns `more_pending`, so no one request is expensive and a long source is
 * continued inside Almanac. Rejecting a long paste would instead push the person
 * back to another app to re-prompt and return — the one round trip the whole
 * bring-it-in flow exists to avoid. Storing the source is nearly free; only
 * processing costs, and processing is already paced.
 *
 * These limits therefore bound spend over a rolling window, not the size of any
 * one thing a person brings in.
 */

export const PROCESSING_WINDOW_HOURS = 24;

/** Distinct processing requests, so repeated continues cannot run away. */
export const MAX_PROCESSING_RUNS_PER_WINDOW = 40;

/** The control that actually bounds spend, since cost tracks segments. */
export const MAX_SEGMENTS_PER_WINDOW = 180;

export type ProcessingUsage = {
  runsInWindow: number;
  segmentsInWindow: number;
};

export type ProcessingBudgetDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "TOO_MANY_RUNS" | "SEGMENT_BUDGET_EXHAUSTED";
      retryAfterHours: number;
      message: string;
    };

/**
 * Pure budget decision. Kept separate from the database so every branch is
 * testable without one, and so the numbers can be reasoned about directly.
 *
 * `segmentCount` is what this run will actually process, not the size of the
 * whole source.
 */
export function planProcessingBudget(input: {
  segmentCount: number;
  usage: ProcessingUsage;
}): ProcessingBudgetDecision {
  if (input.usage.runsInWindow >= MAX_PROCESSING_RUNS_PER_WINDOW) {
    return {
      allowed: false,
      code: "TOO_MANY_RUNS",
      retryAfterHours: PROCESSING_WINDOW_HOURS,
      message:
        "Almanac has taken in a lot today. Your source is saved — carry on with it tomorrow.",
    };
  }

  if (input.usage.segmentsInWindow + input.segmentCount > MAX_SEGMENTS_PER_WINDOW) {
    return {
      allowed: false,
      code: "SEGMENT_BUDGET_EXHAUSTED",
      retryAfterHours: PROCESSING_WINDOW_HOURS,
      message:
        "Almanac has taken in a lot today. Your source is saved — carry on with it tomorrow.",
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
