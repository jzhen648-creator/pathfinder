import type { Prisma } from "@prisma/client";
import { ATLAS_DISPERSION_ORDER } from "@/lib/atlas/atlas-placement";

type AtlasPlacementDb = Pick<Prisma.TransactionClient, "atlasPlacement">;

export type CapturedAtlasPlacement = {
  goalId: string;
  slot: number;
  hiddenAt: Date | null;
  focusedAt: Date | null;
  version: number;
  createdAt: Date;
};

/**
 * Atlas positions belong to a user as well as a Chapter. Remove the guest rows
 * before moving Chapters so overlapping guest/account slots cannot violate the
 * target user's unique slot constraint.
 */
export async function captureAtlasPlacementsForMerge(
  db: AtlasPlacementDb,
  sourceUserId: string,
): Promise<CapturedAtlasPlacement[]> {
  const placements = await db.atlasPlacement.findMany({
    where: { userId: sourceUserId },
    select: {
      goalId: true,
      slot: true,
      hiddenAt: true,
      focusedAt: true,
      version: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { goalId: "asc" }],
  });

  if (placements.length > 0) {
    await db.atlasPlacement.deleteMany({ where: { userId: sourceUserId } });
  }

  return placements;
}

/**
 * Preserve a guest Chapter's familiar position when it is free. When it
 * collides with an existing account position, choose the next authored Atlas
 * slot. Chapters beyond the 64-point visual capacity remain available in the
 * Index and receive a position if capacity is freed later.
 */
export async function restoreAtlasPlacementsAfterMerge(
  db: AtlasPlacementDb,
  targetUserId: string,
  captured: CapturedAtlasPlacement[],
): Promise<void> {
  if (captured.length === 0) return;

  const occupiedRows = await db.atlasPlacement.findMany({
    where: { userId: targetUserId },
    select: { slot: true },
  });
  const occupied = new Set(occupiedRows.map(({ slot }) => slot));
  const data: Array<{
    goalId: string;
    userId: string;
    slot: number;
    hiddenAt: Date | null;
    focusedAt: Date | null;
    version: number;
    createdAt: Date;
  }> = [];

  for (const placement of captured) {
    const slot = !occupied.has(placement.slot)
      ? placement.slot
      : ATLAS_DISPERSION_ORDER.find((candidate) => !occupied.has(candidate));
    if (slot == null) continue;

    occupied.add(slot);
    data.push({
      goalId: placement.goalId,
      userId: targetUserId,
      slot,
      hiddenAt: placement.hiddenAt,
      focusedAt: placement.focusedAt,
      version: placement.version,
      createdAt: placement.createdAt,
    });
  }

  if (data.length > 0) {
    await db.atlasPlacement.createMany({ data });
  }
}
