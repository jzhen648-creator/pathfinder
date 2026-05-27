import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function computeMapVersion(userId: string): Promise<string> {
  const [goals, milestones, marks, branches] = await Promise.all([
    prisma.goal.aggregate({
      where: { userId, archived: false, goalType: { notIn: ["moment", "event"] } },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
    prisma.milestone.aggregate({
      where: { goal: { userId, archived: false } },
      _count: { id: true },
      _max: { completedAt: true },
    }),
    prisma.mark.aggregate({
      where: { userId, archived: false },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
    prisma.branch.aggregate({
      where: { userId, isActive: true },
      _count: { id: true },
      _max: { updatedAt: true },
    }),
  ]);

  const fingerprint = {
    pursuits: goals._count.id,
    milestones: milestones._count.id,
    marks: marks._count.id,
    hubs: branches._count.id,
    maxUpdatedAt: [
      goals._max.updatedAt?.toISOString() ?? null,
      milestones._max.completedAt?.toISOString() ?? null,
      marks._max.updatedAt?.toISOString() ?? null,
      branches._max.updatedAt?.toISOString() ?? null,
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  };

  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 32);
}

/** UserMemory.version — insights invalidate when this changes. */
export async function getMemoryVersion(userId: string): Promise<number> {
  const row = await prisma.userMemory.findUnique({
    where: { userId },
    select: { version: true },
  });
  return row?.version ?? 0;
}
