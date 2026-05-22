import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

const LIFE_AREA_SET = new Set<string>(LIFE_AREA_IDS);

export function isLifeAreaId(value: string): value is LifeAreaId {
  return LIFE_AREA_SET.has(value);
}

/** Parse `User.unlockedLimbIds` JSON — invalid entries dropped. */
export function parseUnlockedLimbIds(raw: unknown): LifeAreaId[] {
  if (!Array.isArray(raw)) return [];
  const out: LifeAreaId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isLifeAreaId(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Themes on the map: persisted unlock list plus any limb that already has an active hub
 * (legacy users who activated before theme-only unlock).
 */
export function mergeUnlockedLimbIds(
  stored: readonly LifeAreaId[],
  branchRows: readonly { limbId: string; parentBranchId?: string | null; isActive?: boolean | null }[],
): LifeAreaId[] {
  const set = new Set<LifeAreaId>(stored);
  for (const b of branchRows) {
    if (!b.parentBranchId && b.isActive === true && isLifeAreaId(b.limbId)) {
      set.add(b.limbId);
    }
  }
  return LIFE_AREA_IDS.filter((id) => set.has(id));
}

export function dormantLimbIdsFromUnlocked(unlocked: readonly LifeAreaId[]): LifeAreaId[] {
  const set = new Set(unlocked);
  return LIFE_AREA_IDS.filter((id) => !set.has(id));
}

/** Unlock themes on the map without activating hub rows. */
export async function unlockThemesForUser(
  prisma: PrismaClient,
  userId: string,
  limbIds: readonly LifeAreaId[],
): Promise<LifeAreaId[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { unlockedLimbIds: true },
  });
  if (!user) return [];

  const current = parseUnlockedLimbIds(user.unlockedLimbIds);
  const next = new Set<LifeAreaId>(current);
  for (const id of limbIds) {
    if (isLifeAreaId(id)) next.add(id);
  }
  const merged = LIFE_AREA_IDS.filter((id) => next.has(id));

  await prisma.user.update({
    where: { id: userId },
    data: { unlockedLimbIds: merged },
  });

  return merged;
}
