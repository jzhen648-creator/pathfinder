import type { AiReadingDirtyEntityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReadingDirtyDetails } from "@/lib/map/reading-dirty-details";
import {
  hasMinimumContextSignal,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { clampSignificance } from "@/lib/pursuit/significance";

export type ReadingDirtySummary = {
  pursuitIds: string[];
  themeIds: string[];
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
    },
    update: {
      reason: reason.slice(0, 500),
      details: detailsJson,
      createdAt: new Date(),
    },
  });
}

export async function markPursuitReadingDirty(
  userId: string,
  pursuitId: string,
  reason: string,
  options?: {
    details?: ReadingDirtyDetails | null;
  },
): Promise<void> {
  await markReadingDirty(userId, "pursuit", pursuitId, reason, options);
  await markReadingDirty(userId, "global", "map", "pursuit_changed");
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
  let hasGlobal = false;

  for (const row of rows) {
    switch (row.entityType) {
      case "pursuit":
        pursuitIds.push(row.entityId);
        break;
      case "theme":
        themeIds.push(row.entityId);
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
    hasGlobal,
    totalItems: rows.length,
  };
}

function parseDetails(raw: unknown): ReadingDirtyDetails | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ReadingDirtyDetails;
}

const MS_PER_DAY = 86_400_000;

/** Matches map aggregate window in compile-reading-packet / spine-events. */
export const RECENT_COMPLETION_WINDOW_DAYS = 90;

export type DirtyPursuitPriorityRow = {
  id: string;
  significance: number;
  signal: PursuitSignal;
  deadline: Date | null;
  createdAt: Date;
  status: string;
  completedAt: Date | null;
};

/** Whole-pursuit COMPLETE within the recent-completion window. */
export function isRecentlyCompletedPursuit(
  status: string,
  completedAt: Date | null,
  now = Date.now(),
): boolean {
  if (status !== "COMPLETE") return false;
  if (!completedAt) return false;
  const cutoff = now - RECENT_COMPLETION_WINDOW_DAYS * MS_PER_DAY;
  return completedAt.getTime() >= cutoff;
}

function daysUntilDeadline(deadline: Date | null, now: number): number {
  if (!deadline) return Number.POSITIVE_INFINITY;
  return Math.ceil((deadline.getTime() - now) / MS_PER_DAY);
}

/** Deterministic QQ / reflect priority — significance, recent completion, thinness, deadline, age. */
export function compareDirtyPursuitPriority(
  a: DirtyPursuitPriorityRow,
  b: DirtyPursuitPriorityRow,
  now = Date.now(),
): number {
  if (a.significance !== b.significance) {
    return b.significance - a.significance;
  }

  const aRecent = isRecentlyCompletedPursuit(a.status, a.completedAt, now) ? 0 : 1;
  const bRecent = isRecentlyCompletedPursuit(b.status, b.completedAt, now) ? 0 : 1;
  if (aRecent !== bRecent) {
    return aRecent - bRecent;
  }

  const aThin = hasMinimumContextSignal(a.signal) ? 1 : 0;
  const bThin = hasMinimumContextSignal(b.signal) ? 1 : 0;
  if (aThin !== bThin) {
    return aThin - bThin;
  }

  const daysA = daysUntilDeadline(a.deadline, now);
  const daysB = daysUntilDeadline(b.deadline, now);
  if (daysA !== daysB) {
    return daysA - daysB;
  }

  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function sortDirtyPursuitPriorityRows<T extends DirtyPursuitPriorityRow>(
  rows: T[],
  now = Date.now(),
): T[] {
  return [...rows].sort((a, b) => compareDirtyPursuitPriority(a, b, now));
}

/** Load pursuit fields and sort dirty ids for reflect/enrich batching. */
export async function sortDirtyPursuitIdsForReflect(
  userId: string,
  pursuitIds: string[],
  now = Date.now(),
): Promise<string[]> {
  const ids = [...new Set(pursuitIds.filter(Boolean))];
  if (ids.length <= 1) return ids;

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: ids }, archived: false },
    select: {
      id: true,
      title: true,
      background: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      completedAt: true,
      targetAmount: true,
      significance: true,
      createdAt: true,
      milestones: { select: { completedAt: true } },
    },
  });

  const rows: DirtyPursuitPriorityRow[] = goals.map((goal) => ({
    id: goal.id,
    significance: clampSignificance(goal.significance),
    signal: pursuitSignalFromGoal(goal),
    deadline: goal.deadline,
    createdAt: goal.createdAt,
    status: goal.status,
    completedAt: goal.completedAt,
  }));

  const sorted = sortDirtyPursuitPriorityRows(rows, now).map((row) => row.id);
  const missing = ids.filter((id) => !sorted.includes(id));
  return [...sorted, ...missing];
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
  "milestone_deleted",
  "milestone_reordered",
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

  const activeDirtyPursuitIds = await sortDirtyPursuitIdsForReflect(
    userId,
    pursuitIds.filter((id) => {
      const goal = goalById.get(id);
      return Boolean(goal && !goal.archived);
    }),
  );
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

/** True when reflect must regenerate from the full map — archive/delete or no active dirty targets. */
export function needsFullReflectRegen(dirty: ReadingDirtyAnalysis): boolean {
  if (dirty.staleDirtyPursuitIds.length > 0) return true;
  if (dirty.hasPursuitArchivedReason) return true;
  if (dirty.hasGlobal && dirty.activeDirtyPursuitIds.length === 0) return true;
  return false;
}

export async function clearReadingDirtyLedger(userId: string): Promise<void> {
  await prisma.aiReadingDirtyItem.deleteMany({ where: { userId } });
}

/**
 * Clear only rows that existed at (or before) `cutoff`. Edits made while a
 * sync is running upsert their dirty row with a fresh `createdAt`, so they
 * survive this clear and drive the next incremental sync.
 */
export async function clearReadingDirtyLedgerBefore(userId: string, cutoff: Date): Promise<void> {
  await prisma.aiReadingDirtyItem.deleteMany({
    where: { userId, createdAt: { lte: cutoff } },
  });
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
