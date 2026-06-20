import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

const LIFE_AREA_SET = new Set<string>(LIFE_AREA_IDS);

export function isLifeAreaId(value: string): value is LifeAreaId {
  return LIFE_AREA_SET.has(value);
}

/** Parse `User.unlockedLimbIds` JSON — invalid entries dropped. */
export function parseUnlockedThemeIds(raw: unknown): LifeAreaId[] {
  if (!Array.isArray(raw)) return [];
  const out: LifeAreaId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isLifeAreaId(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/** @deprecated Use {@link parseUnlockedThemeIds}. */
export const parseUnlockedLimbIds = parseUnlockedThemeIds;

/**
 * Themes on the map: persisted unlock list plus any theme that already has an active category row
 * (legacy users who activated before theme-only unlock).
 */
export function mergeUnlockedThemeIds(
  stored: readonly LifeAreaId[],
  categoryRows: readonly { themeId?: string; limbId?: string; isActive?: boolean | null }[],
): LifeAreaId[] {
  const set = new Set<LifeAreaId>(stored);
  for (const row of categoryRows) {
    const rowTheme = row.themeId ?? row.limbId;
    if (row.isActive === true && rowTheme && isLifeAreaId(rowTheme)) {
      set.add(rowTheme);
    }
  }
  return LIFE_AREA_IDS.filter((id) => set.has(id));
}

/** @deprecated Use {@link mergeUnlockedThemeIds}. */
export const mergeUnlockedLimbIds = mergeUnlockedThemeIds;

export function dormantThemeIdsFromUnlocked(unlocked: readonly LifeAreaId[]): LifeAreaId[] {
  const set = new Set(unlocked);
  return LIFE_AREA_IDS.filter((id) => !set.has(id));
}

/** @deprecated Use {@link dormantThemeIdsFromUnlocked}. */
export const dormantLimbIdsFromUnlocked = dormantThemeIdsFromUnlocked;

/** Unlock themes on the map without activating category rows. */
export async function unlockThemesForUser(
  prisma: PrismaClient,
  userId: string,
  themeIds: readonly LifeAreaId[],
): Promise<LifeAreaId[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { unlockedLimbIds: true },
  });
  if (!user) return [];

  const current = parseUnlockedThemeIds(user.unlockedLimbIds);
  const next = new Set<LifeAreaId>(current);
  for (const id of themeIds) {
    if (isLifeAreaId(id)) next.add(id);
  }
  const merged = LIFE_AREA_IDS.filter((id) => next.has(id));

  await prisma.user.update({
    where: { id: userId },
    data: { unlockedLimbIds: merged },
  });

  return merged;
}
