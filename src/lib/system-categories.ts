import type { ThemeCategory, PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { LOCKED_CATEGORY_TEMPLATES, normalizeCategoryLabelKey } from "@/lib/taxonomy";

function normLabel(label: string | null | undefined): string {
  return (label ?? "").trim().toLowerCase();
}

export function systemCategoryKey(limbId: string, label: string | null | undefined): string {
  return `${limbId}::${normalizeCategoryLabelKey(label ?? "")}`;
}

export function isLockedSystemCategory(branch: Pick<ThemeCategory, "isSystemCategory">): boolean {
  return branch.isSystemCategory === true;
}

function matchesTemplate(limbId: string, label: string | null | undefined): boolean {
  const key = normalizeCategoryLabelKey(label ?? "");
  return LOCKED_CATEGORY_TEMPLATES.some(
    (t) => t.limbId === limbId && normalizeCategoryLabelKey(t.threadType) === key,
  );
}

/**
 * Idempotently ensures all 22 locked taxonomy categories exist for the user (dormant by default).
 * Returns the number of categories created.
 */
export async function ensureSystemCategoriesForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return 0;

  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    orderBy: { createdAt: "asc" },
  });

  const present = new Map<string, ThemeCategory>();
  for (const b of roots) {
    const key = systemCategoryKey(b.themeId, b.label ?? b.name);
    const existing = present.get(key);
    if (!existing || b.createdAt < existing.createdAt) {
      present.set(key, b);
    }
  }

  const base = Date.UTC(2026, 0, 1);
  let order = roots.length;
  let created = 0;

  for (const t of LOCKED_CATEGORY_TEMPLATES) {
    const key = systemCategoryKey(t.limbId, t.threadType);
    if (present.has(key)) continue;

    await prisma.themeCategory.create({
      data: {
        userId,
        themeId: t.limbId,
        label: t.threadType,
        name: t.name,
        status: "active",
        lifecycleStatus: "ACTIVE",
        isSystemCategory: true,
        isActive: false,
        order,
        createdAt: new Date(base + order * 60_000),
      },
    });
    order += 1;
    created += 1;
  }

  for (const b of roots) {
    if (b.isSystemCategory) continue;
    if (!matchesTemplate(b.themeId, b.label ?? b.name)) continue;
    await prisma.themeCategory.update({
      where: { id: b.id },
      data: { isSystemCategory: true },
    });
  }

  return created;
}

export async function activateLimbsForUser(
  prisma: PrismaClient,
  userId: string,
  limbIds: readonly LifeAreaId[],
): Promise<number> {
  if (limbIds.length === 0) return 0;
  const result = await prisma.themeCategory.updateMany({
    where: {
      userId,
      parentCategoryId: null,
      isSystemCategory: true,
      themeId: { in: [...limbIds] },
    },
    data: { isActive: true },
  });
  return result.count;
}

export async function activateCategoryForUser(
  prisma: PrismaClient,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const branch = await prisma.themeCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, isActive: true },
  });
  if (!branch) return false;
  if (branch.isActive) return true;
  await prisma.themeCategory.update({
    where: { id: branch.id },
    data: { isActive: true },
  });
  return true;
}

export async function listSystemCategoryKeysForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> {
  const rows = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null, isSystemCategory: true },
    select: { themeId: true, label: true, name: true },
  });
  return rows.map((r) => systemCategoryKey(r.themeId, r.label ?? r.name));
}

export { normLabel };

export const systemHubKey = systemCategoryKey;
export const isLockedSystemHub = isLockedSystemCategory;
export const ensureSystemHubsForUser = ensureSystemCategoriesForUser;
export const activateHubForUser = activateCategoryForUser;
export const listSystemHubKeysForUser = listSystemCategoryKeysForUser;