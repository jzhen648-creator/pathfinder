import { DEFAULT_IMPORT_SEGMENTS_PER_RUN } from "@/lib/imports/process-source";
import { segmentImportSource } from "@/lib/imports/segmentation";
import {
  loadProcessingUsage,
  planProcessingBudget,
  type ProcessingBudgetDecision,
} from "@/lib/imports/processing-budget";
import { prisma } from "@/lib/prisma";

/**
 * Decide whether this user may process this source, before any model call is
 * made and before any job row is written.
 *
 * A source that is already part-processed is not re-charged for the segments it
 * has: budget is spent by jobs, and resuming an existing job does not create a
 * new one.
 */
export async function enforceProcessingBudget(
  userId: string,
  sourceId: string,
  now: Date = new Date(),
): Promise<ProcessingBudgetDecision> {
  const source = await prisma.importSource.findFirst({
    where: { id: sourceId, userId },
    select: { rawText: true },
  });
  // A missing source is not a budget problem; let the processor raise not-found.
  if (!source) return { allowed: true };

  // Charge for what this run will process, not the whole source: a long
  // source is paced across runs rather than refused.
  const segmentCount = Math.min(
    segmentImportSource(source.rawText).length,
    DEFAULT_IMPORT_SEGMENTS_PER_RUN,
  );
  const usage = await loadProcessingUsage(prisma, userId, now);
  return planProcessingBudget({ segmentCount, usage });
}
