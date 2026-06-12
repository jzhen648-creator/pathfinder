import type { AiReadingDirtyEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReadingDirtySummary = {
  pursuitIds: string[];
  themeIds: string[];
  hubIds: string[];
  markIds: string[];
  hasGlobal: boolean;
  totalItems: number;
};

export async function markReadingDirty(
  userId: string,
  entityType: AiReadingDirtyEntityType,
  entityId: string,
  reason: string,
  streamRunId?: string | null,
): Promise<void> {
  const id = entityId.trim();
  if (!id) return;
  await prisma.aiReadingDirtyItem.upsert({
    where: {
      userId_entityType_entityId: { userId, entityType, entityId: id },
    },
    create: {
      userId,
      entityType,
      entityId: id,
      reason: reason.slice(0, 500),
      streamRunId: streamRunId ?? null,
    },
    update: {
      reason: reason.slice(0, 500),
      streamRunId: streamRunId ?? undefined,
      createdAt: new Date(),
    },
  });
}

export async function markPursuitReadingDirty(
  userId: string,
  pursuitId: string,
  reason: string,
  streamRunId?: string | null,
): Promise<void> {
  await markReadingDirty(userId, "pursuit", pursuitId, reason, streamRunId);
  await markReadingDirty(userId, "global", "map", "pursuit_changed");
}

export async function markMarkReadingDirty(
  userId: string,
  markId: string,
  themeId: string,
  reason: string,
): Promise<void> {
  await markReadingDirty(userId, "mark", markId, reason);
  if (themeId.trim()) {
    await markReadingDirty(userId, "theme", themeId, reason);
  }
  await markReadingDirty(userId, "global", "map", "mark_changed");
}

export async function markGlobalReadingDirty(userId: string, reason: string): Promise<void> {
  await markReadingDirty(userId, "global", "map", reason);
}

export async function listReadingDirtySummary(userId: string): Promise<ReadingDirtySummary> {
  const rows = await prisma.aiReadingDirtyItem.findMany({
    where: { userId },
    select: { entityType: true, entityId: true },
  });

  const pursuitIds: string[] = [];
  const themeIds: string[] = [];
  const hubIds: string[] = [];
  const markIds: string[] = [];
  let hasGlobal = false;

  for (const row of rows) {
    switch (row.entityType) {
      case "pursuit":
        pursuitIds.push(row.entityId);
        break;
      case "theme":
        themeIds.push(row.entityId);
        break;
      case "hub":
        hubIds.push(row.entityId);
        break;
      case "mark":
        markIds.push(row.entityId);
        break;
      case "global":
        hasGlobal = true;
        break;
      default:
        break;
    }
  }

  return {
    pursuitIds: [...new Set(pursuitIds)],
    themeIds: [...new Set(themeIds)],
    hubIds: [...new Set(hubIds)],
    markIds: [...new Set(markIds)],
    hasGlobal,
    totalItems: rows.length,
  };
}

export async function clearReadingDirtyLedger(userId: string): Promise<void> {
  await prisma.aiReadingDirtyItem.deleteMany({ where: { userId } });
}

export async function clearReadingDirtyForPursuits(
  userId: string,
  pursuitIds: string[],
): Promise<void> {
  const ids = [...new Set(pursuitIds.filter(Boolean))];
  if (ids.length === 0) return;
  await prisma.aiReadingDirtyItem.deleteMany({
    where: {
      userId,
      entityType: "pursuit",
      entityId: { in: ids },
    },
  });
}

export async function countEligiblePursuits(userId: string): Promise<number> {
  return prisma.goal.count({
    where: {
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
  });
}

/** True when dirty pursuits exceed threshold — fall back to full refresh. */
export async function shouldUseFullReadingRefresh(
  userId: string,
  dirtyPursuitCount: number,
  thresholdRatio = 0.35,
): Promise<boolean> {
  const total = await countEligiblePursuits(userId);
  if (total === 0) return false;
  if (dirtyPursuitCount === 0) return true;
  return dirtyPursuitCount / total > thresholdRatio;
}
