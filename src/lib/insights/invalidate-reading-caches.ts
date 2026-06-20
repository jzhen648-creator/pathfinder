import {
  parsePursuitInsightRecord,
} from "@/lib/insights/parse-insight-cache";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import { prisma } from "@/lib/prisma";

/** Remove one pursuit from the insight cache (archive, abandon, or hard cleanup). */
export async function prunePursuitInsightFromCache(
  userId: string,
  pursuitId: string,
): Promise<boolean> {
  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) return false;

  const pursuits = parsePursuitInsightRecord(existing.pursuitInsights, "pursuit");
  if (!(pursuitId in pursuits)) return false;

  const { [pursuitId]: _removed, ...pruned } = pursuits;
  await prisma.insightCache.update({
    where: { userId },
    data: {
      pursuitInsights: pruned,
      generatedAt: new Date(),
    },
  });
  return true;
}

/**
 * Drop per-pursuit insight entries for pursuits no longer interpretation-eligible
 * (archived or abandoned).
 */
export async function pruneOffMapPursuitsFromInsightCache(userId: string): Promise<boolean> {
  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) return false;

  const activeGoals = await prisma.goal.findMany({
    where: {
      userId,
      ...interpretationEligiblePursuitWhere,
    },
    select: { id: true },
  });
  const activeIds = new Set(activeGoals.map((goal) => goal.id));

  const pursuits = parsePursuitInsightRecord(existing.pursuitInsights, "pursuit");
  const prunedEntries = Object.entries(pursuits).filter(([id]) => activeIds.has(id));
  if (prunedEntries.length === Object.keys(pursuits).length) return false;

  const pruned = Object.fromEntries(prunedEntries);
  await prisma.insightCache.update({
    where: { userId },
    data: {
      pursuitInsights: pruned,
      generatedAt: new Date(),
    },
  });
  return true;
}

/** @deprecated Use {@link pruneOffMapPursuitsFromInsightCache} */
export const pruneArchivedPursuitsFromInsightCache = pruneOffMapPursuitsFromInsightCache;

/** Pursuit insight rows for pursuits that left the live map. */
export async function excludePursuitFromInterpretation(
  userId: string,
  pursuitId: string,
): Promise<void> {
  await prunePursuitInsightFromCache(userId, pursuitId);
}
