import { getMemoryVersion } from "@/lib/insights/compute-map-version";
import { prisma } from "@/lib/prisma";

const MAX_HISTORY_ROWS = 5;

export type UserMemoryRow = {
  id: string;
  userId: string;
  blob: string;
  version: number;
  isDirty: boolean;
  lastUserEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function pruneUserMemoryHistory(userId: string): Promise<void> {
  const rows = await prisma.userMemoryHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_HISTORY_ROWS,
  });
  if (rows.length === 0) return;
  await prisma.userMemoryHistory.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
}

async function pushHistoryRow(userId: string, blob: string, version: number): Promise<void> {
  await prisma.userMemoryHistory.create({
    data: { userId, blob, version },
  });
  await pruneUserMemoryHistory(userId);
}

/** Bump InsightCache.memoryVersion so insights invalidate when WHO context changes. */
export async function bumpInsightMemoryVersion(userId: string, memoryVersion: number): Promise<void> {
  const existing = await prisma.insightCache.findUnique({ where: { userId } });
  if (!existing) return;
  if (existing.memoryVersion === memoryVersion) return;
  await prisma.insightCache.update({
    where: { userId },
    data: { memoryVersion },
  });
}

type WriteUserMemoryOptions = {
  userId: string;
  blob: string;
  /** When true, set lastUserEditedAt to now (manual profile edit). */
  userEdited?: boolean;
  /** Allow empty blob when the user intentionally clears their summary. */
  allowEmpty?: boolean;
  clearDirty?: boolean;
};

/**
 * Create or update UserMemory, pushing the previous blob to history when updating.
 */
export async function writeUserMemory(options: WriteUserMemoryOptions): Promise<UserMemoryRow> {
  const trimmed = options.blob.trim();
  if (!trimmed && !(options.allowEmpty && options.userEdited)) {
    throw new Error("Memory blob cannot be empty.");
  }

  const existing = await prisma.userMemory.findUnique({
    where: { userId: options.userId },
  });

  if (existing) {
    if (trimmed) {
      await pushHistoryRow(options.userId, existing.blob, existing.version);
    }
    const nextVersion = trimmed ? existing.version + 1 : existing.version;
    const row = await prisma.userMemory.update({
      where: { userId: options.userId },
      data: {
        blob: trimmed,
        version: nextVersion,
        isDirty: options.clearDirty === false ? existing.isDirty : false,
        lastUserEditedAt: options.userEdited ? new Date() : existing.lastUserEditedAt,
      },
    });
    await bumpInsightMemoryVersion(options.userId, await getMemoryVersion(options.userId));
    return row;
  }

  if (!trimmed) {
    throw new Error("Memory blob cannot be empty.");
  }

  const row = await prisma.userMemory.create({
    data: {
      userId: options.userId,
      blob: trimmed,
      version: 1,
      isDirty: false,
      lastUserEditedAt: options.userEdited ? new Date() : null,
    },
  });
  await bumpInsightMemoryVersion(options.userId, await getMemoryVersion(options.userId));
  return row;
}

export async function markUserMemoryDirty(userId: string): Promise<void> {
  const existing = await prisma.userMemory.findUnique({ where: { userId } });
  if (!existing) return;
  if (existing.isDirty) return;
  await prisma.userMemory.update({
    where: { userId },
    data: { isDirty: true },
  });
}

export function serializeUserMemory(row: UserMemoryRow, pendingIncorporateCount = 0) {
  return {
    blob: row.blob,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    lastUserEditedAt: row.lastUserEditedAt?.toISOString() ?? null,
    isDirty: row.isDirty,
    pendingIncorporateCount,
  };
}
