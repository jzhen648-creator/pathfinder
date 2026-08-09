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

  const segmentCount = segmentImportSource(source.rawText).length;
  const usage = await loadProcessingUsage(prisma, userId, now);
  return planProcessingBudget({ segmentCount, usage });
}
