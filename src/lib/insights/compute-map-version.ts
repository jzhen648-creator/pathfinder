import { createHash } from "crypto";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import { prisma } from "@/lib/prisma";

export async function computeMapVersion(userId: string): Promise<string> {
  const [goals, milestones, marks, branches, relationships] = await Promise.all([
    prisma.goal.aggregate({
      where: { userId, ...interpretationEligiblePursuitWhere },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
    prisma.milestone.aggregate({
      where: { goal: { userId, ...interpretationEligiblePursuitWhere } },
      _count: { id: true },
      _max: { completedAt: true },
    }),
    prisma.mark.aggregate({
      where: { userId, archived: false },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
    prisma.themeCategory.aggregate({
      where: { userId, isActive: true },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
    prisma.pursuitRelationship.aggregate({
      where: { userId },
      _count: { id: true },
      _max: { confirmedAt: true },
    }),
  ]);

  const fingerprint = {
    pursuits: goals._count.id,
    milestones: milestones._count.id,
    marks: marks._count.id,
    hubs: branches._count.id,
    relationships: relationships._count.id,
    maxUpdatedAt: [
      goals._max.updatedAt?.toISOString() ?? null,
      milestones._max.completedAt?.toISOString() ?? null,
      marks._max.updatedAt?.toISOString() ?? null,
      branches._max.updatedAt?.toISOString() ?? null,
      relationships._max.confirmedAt?.toISOString() ?? null,
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  };

  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 32);
}

const MEMORY_VERSION_FACTS_MULTIPLIER = 100_000;

export function profileFactsMemoryOffset(count: number, maxUpdatedAt: Date | null): number {
  if (count === 0 || !maxUpdatedAt) return 0;
  return (Math.floor(maxUpdatedAt.getTime() / 1000) % (MEMORY_VERSION_FACTS_MULTIPLIER - 1)) + count;
}

/** UserMemory.version + profile-fact drift — insights invalidate when either changes. */
export async function getMemoryVersion(userId: string): Promise<number> {
  const [memoryRow, factsAgg] = await Promise.all([
    prisma.userMemory.findUnique({
      where: { userId },
      select: { version: true },
    }),
    prisma.profileFact.aggregate({
      where: { userId },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
  ]);

  const base = memoryRow?.version ?? 0;
  const factsOffset = profileFactsMemoryOffset(factsAgg._count.id, factsAgg._max.updatedAt);
  return base * MEMORY_VERSION_FACTS_MULTIPLIER + factsOffset;
}
