import type { AiReadingDirtyEntityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReadingDirtyDetails } from "@/lib/map/reading-dirty-details";

export type ReadingDirtySummary = {
  pursuitIds: string[];
  themeIds: string[];
  hubIds: string[];
  markIds: string[];
  hasGlobal: boolean;
  totalItems: number;
};

export type ReadingDirtyRow = {
  entityType: string;
  entityId: string;
  reason: string;
  details: ReadingDirtyDetails | null;
};

export async function markReadingDirty(
  userId: string,
  entityType: AiReadingDirtyEntityType,
  entityId: string,
  reason: string,
  options?: {
    streamRunId?: string | null;
    details?: ReadingDirtyDetails | null;
  },
): Promise<void> {
  const id = entityId.trim();
  if (!id) return;
  const detailsJson =
    options?.details != null ? (options.details as Prisma.InputJsonValue) : undefined;
  await prisma.aiReadingDirtyItem.upsert({
    where: {
      userId_entityType_entityId: { userId, entityType, entityId: id },
    },
    create: {
      userId,
      entityType,
      entityId: id,
      reason: reason.slice(0, 500),
      details: detailsJson,
      streamRunId: options?.streamRunId ?? null,
    },
    update: {
      reason: reason.slice(0, 500),
      details: detailsJson,
      streamRunId: options?.streamRunId ?? undefined,
      createdAt: new Date(),
    },
  });
}

export async function markPursuitReadingDirty(
  userId: string,
  pursuitId: string,
  reason: string,
  options?: {
    streamRunId?: string | null;
    details?: ReadingDirtyDetails | null;
  },
): Promise<void> {
  await markReadingDirty(userId, "pursuit", pursuitId, reason, options);
  await markReadingDirty(userId, "global", "map", "pursuit_changed");
}

export async function markMarkReadingDirty(
  userId: string,
  markId: string,
  themeId: string,
  reason: string,
  details?: ReadingDirtyDetails | null,
): Promise<void> {
  await markReadingDirty(userId, "mark", markId, reason, { details });
  if (themeId.trim()) {
    await markReadingDirty(userId, "theme", themeId, reason, { details });
  }
  await markReadingDirty(userId, "global", "map", "mark_changed");
}

export async function markGlobalReadingDirty(userId: string, reason: string): Promise<void> {
  await markReadingDirty(userId, "global", "map", reason);
}

export type ReadingDirtyAnalysis = ReadingDirtySummary & {
  /** Any dirty row recorded a pursuit archive/delete. */
  hasPursuitArchivedReason: boolean;
  /** Dirty pursuit ids that no longer exist or are archived — deletions not visible to delta. */
  staleDirtyPursuitIds: string[];
  /** Dirty pursuit ids still on the live map. */
  activeDirtyPursuitIds: string[];
};

function summarizeDirtyRows(
  rows: Array<{ entityType: string; entityId: string }>,
): ReadingDirtySummary {
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

function parseDetails(raw: unknown): ReadingDirtyDetails | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ReadingDirtyDetails;
}

export async function listReadingDirtySummary(userId: string): Promise<ReadingDirtySummary> {
  const rows = await prisma.aiReadingDirtyItem.findMany({
    where: { userId },
    select: { entityType: true, entityId: true },
  });
  return summarizeDirtyRows(rows);
}

export async function listReadingDirtyRows(userId: string): Promise<ReadingDirtyRow[]> {
  const rows = await prisma.aiReadingDirtyItem.findMany({
    where: { userId },
    select: { entityType: true, entityId: true, reason: true, details: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    details: parseDetails(row.details),
  }));
}

/** Minimum dirty `pursuit_created` rows to prefer a full batch refresh. */
export const CREATE_BURST_DIRTY_THRESHOLD = 4;

export async function countDirtyPursuitsByReason(
  userId: string,
  reason: string,
): Promise<number> {
  return prisma.aiReadingDirtyItem.count({
    where: {
      userId,
      entityType: "pursuit",
      reason,
    },
  });
}

export async function shouldUseCreateBurstFullRefresh(userId: string): Promise<boolean> {
  const count = await countDirtyPursuitsByReason(userId, "pursuit_created");
  return count >= CREATE_BURST_DIRTY_THRESHOLD;
}

const EDIT_ONLY_DIRTY_REASONS = new Set([
  "pursuit_updated",
  "milestone_updated",
  "clarifier_answered",
  "pursuit_reorganized",
  "pursuit_restored",
]);

/** True when every dirty pursuit row is a metadata edit — prefer delta + enrich over combined full refresh. */
export async function isEditOnlyDirtyBatch(userId: string): Promise<boolean> {
  const rows = await prisma.aiReadingDirtyItem.findMany({
    where: { userId, entityType: "pursuit" },
    select: { reason: true },
  });
  if (rows.length === 0) return false;
  return rows.every((row) => EDIT_ONLY_DIRTY_REASONS.has(row.reason));
}

/** Dirty ledger plus deletion/stale pursuit analysis for sync routing. */
export async function analyzeReadingDirty(userId: string): Promise<ReadingDirtyAnalysis> {
  const rows = await prisma.aiReadingDirtyItem.findMany({
    where: { userId },
    select: { entityType: true, entityId: true, reason: true },
  });

  const summary = summarizeDirtyRows(rows);
  const hasPursuitArchivedReason = rows.some((row) => row.reason.includes("pursuit_archived"));

  const pursuitIds = summary.pursuitIds;
  const goals =
    pursuitIds.length > 0
      ? await prisma.goal.findMany({
          where: { userId, id: { in: pursuitIds } },
          select: { id: true, archived: true },
        })
      : [];
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));

  const activeDirtyPursuitIds = pursuitIds.filter((id) => {
    const goal = goalById.get(id);
    return Boolean(goal && !goal.archived);
  });
  const staleDirtyPursuitIds = pursuitIds.filter((id) => {
    const goal = goalById.get(id);
    return !goal || goal.archived;
  });

  return {
    ...summary,
    hasPursuitArchivedReason,
    staleDirtyPursuitIds,
    activeDirtyPursuitIds,
  };
}

/** True when the season read must be regenerated from the full map — not story delta. */
export function needsFullStoryRegen(dirty: ReadingDirtyAnalysis): boolean {
  if (dirty.staleDirtyPursuitIds.length > 0) return true;
  if (dirty.hasPursuitArchivedReason && dirty.activeDirtyPursuitIds.length === 0) return true;
  if (dirty.hasGlobal && dirty.activeDirtyPursuitIds.length === 0) return true;
  return false;
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
  if (dirtyPursuitCount === 0) return false;
  if (total <= 3) return false;
  return dirtyPursuitCount / total > thresholdRatio;
}
