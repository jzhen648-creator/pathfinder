import type { ThemeCategory, PrismaClient } from "@prisma/client";
import { LOCKED_CATEGORY_TEMPLATES, normalizeCategoryLabelKey } from "@/lib/taxonomy";
import { isLockedSystemCategory, systemCategoryKey } from "@/lib/system-categories";

function matchesTemplate(limbId: string, label: string | null | undefined): boolean {
  const key = normalizeCategoryLabelKey(label ?? "");
  return LOCKED_CATEGORY_TEMPLATES.some(
    (t) => t.limbId === limbId && normalizeCategoryLabelKey(t.threadType) === key,
  );
}

/** Prefer canonical template label, then system category, then oldest row. */
export function pickKeeperCategory(list: readonly ThemeCategory[]): ThemeCategory {
  return [...list].sort((a, b) => {
    const aTemplate = matchesTemplate(a.themeId, a.label ?? a.name) ? 0 : 1;
    const bTemplate = matchesTemplate(b.themeId, b.label ?? b.name) ? 0 : 1;
    if (aTemplate !== bTemplate) return aTemplate - bTemplate;
    const aSystem = isLockedSystemCategory(a) ? 0 : 1;
    const bSystem = isLockedSystemCategory(b) ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

/**
 * Merges duplicate root categories that share the same canonical slot (e.g. Purpose + Purpose & Values).
 * Idempotent; safe to run on every branches read.
 */
export async function dedupeDuplicateRootCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  let updates = 0;

  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, ThemeCategory[]>();
  for (const branch of roots) {
    const key = systemCategoryKey(branch.themeId, branch.label ?? branch.name);
    const list = groups.get(key) ?? [];
    list.push(branch);
    groups.set(key, list);
  }

  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    const keeper = pickKeeperCategory(list);
    const dupes = list.filter((b) => b.id !== keeper.id);
    for (const dup of dupes) {
      await prisma.goal.updateMany({ where: { categoryId: dup.id }, data: { categoryId: keeper.id } });
      await prisma.mark.updateMany({ where: { categoryId: dup.id }, data: { categoryId: keeper.id } });
      if (!keeper.isSystemCategory && dup.isSystemCategory) {
        await prisma.themeCategory.update({
          where: { id: keeper.id },
          data: { isSystemCategory: true, isActive: keeper.isActive || dup.isActive },
        });
      }
      const canonicalKey = normalizeCategoryLabelKey(keeper.label ?? keeper.name ?? "");
      const template = LOCKED_CATEGORY_TEMPLATES.find(
        (t) => t.limbId === keeper.themeId && normalizeCategoryLabelKey(t.threadType) === canonicalKey,
      );
      if (template && (keeper.label !== template.threadType || keeper.name !== template.name)) {
        await prisma.themeCategory.update({
          where: { id: keeper.id },
          data: { label: template.threadType, name: template.name, isSystemCategory: true },
        });
      }
      await prisma.themeCategory.delete({ where: { id: dup.id } });
      updates += 1;
    }
  }

  return updates;
}

type RootCategoryRow = Pick<ThemeCategory, "id" | "themeId" | "label" | "name" | "isSystemCategory" | "createdAt">;

/** Read-only: one row per canonical category slot (for map context / Stream resolver). */
export function canonicalRootCategoryRows<T extends RootCategoryRow>(roots: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const branch of roots) {
    const key = systemCategoryKey(branch.themeId, branch.label ?? branch.name);
    const list = groups.get(key) ?? [];
    list.push(branch);
    groups.set(key, list);
  }
  const out: T[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const aTemplate = matchesTemplate(a.themeId, a.label ?? a.name) ? 0 : 1;
      const bTemplate = matchesTemplate(b.themeId, b.label ?? b.name) ? 0 : 1;
      if (aTemplate !== bTemplate) return aTemplate - bTemplate;
      const aSystem = a.isSystemCategory ? 0 : 1;
      const bSystem = b.isSystemCategory ? 0 : 1;
      if (aSystem !== bSystem) return aSystem - bSystem;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    out.push(sorted[0]!);
  }
  return out;
}

export const pickKeeperHub = pickKeeperCategory;
export const dedupeDuplicateRootHubs = dedupeDuplicateRootCategories;
export const canonicalRootHubRows = canonicalRootCategoryRows;