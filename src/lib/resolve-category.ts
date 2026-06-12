import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { canonicalRootHubRows } from "@/lib/category-dedupe";
import {
  categoriesForTheme,
  normalizeCategoryLabelKey,
  validCategoryLabelKeysForTheme,
  LIFE_AREA_IDS,
} from "@/lib/taxonomy";
import { systemCategoryKey } from "@/lib/system-categories";

export type ResolvedCategory = {
  categoryId: string;
  hubSlug: string;
  hubLabel: string;
  themeId: LifeAreaId;
  updatedAt?: Date;
};

export function normalizeStreamCategorySlug(slugOrLabel: string): string {
  return normalizeCategoryLabelKey(slugOrLabel);
}

export function isValidHubSlugForTheme(themeId: LifeAreaId, hubSlug: string): boolean {
  const key = normalizeStreamCategorySlug(hubSlug);
  return validCategoryLabelKeysForTheme(themeId).has(key);
}

export function resolveHubTemplateForSlug(themeId: LifeAreaId, hubSlug: string) {
  const key = normalizeStreamCategorySlug(hubSlug);
  return (
    categoriesForTheme(themeId).find((t) => normalizeCategoryLabelKey(t.threadType) === key) ?? null
  );
}

/**
 * Resolve a taxonomy hub slug (e.g. "career") to the user's root {@link Branch} row.
 * Returns null if the slug is unknown for this theme or no matching branch exists.
 */
export async function resolveBranchForHub(
  prisma: PrismaClient,
  userId: string,
  themeId: LifeAreaId,
  hubSlug: string,
): Promise<ResolvedCategory | null> {
  const hubSlugNorm = normalizeStreamCategorySlug(hubSlug);
  if (!isValidHubSlugForTheme(themeId, hubSlugNorm)) {
    return null;
  }

  const template = resolveHubTemplateForSlug(themeId, hubSlugNorm);
  if (!template) return null;

  const roots = await prisma.themeCategory.findMany({
    where: { userId, themeId: themeId, parentCategoryId: null },
    select: { id: true, label: true, name: true, themeId: true, updatedAt: true },
  });

  const match = roots.find(
    (b) => systemCategoryKey(b.themeId, b.label ?? b.name) === systemCategoryKey(themeId, template.threadType),
  );
  if (!match) return null;

  return {
    categoryId: match.id,
    hubSlug: hubSlugNorm,
    hubLabel: template.threadType,
    themeId: themeId,
    updatedAt: match.updatedAt,
  };
}

/** All taxonomy hub slugs for a theme with resolved branch ids (skips missing branches). */
export async function resolveAllHubBranchesForTheme(
  prisma: PrismaClient,
  userId: string,
  themeId: LifeAreaId,
): Promise<ResolvedCategory[]> {
  const templates = categoriesForTheme(themeId);
  const roots = await prisma.themeCategory.findMany({
    where: { userId, themeId: themeId, parentCategoryId: null },
    select: { id: true, label: true, name: true, themeId: true, updatedAt: true },
  });

  const byKey = new Map<string, (typeof roots)[number]>();
  for (const b of roots) {
    byKey.set(systemCategoryKey(b.themeId, b.label ?? b.name), b);
  }

  const out: ResolvedCategory[] = [];
  for (const t of templates) {
    const key = systemCategoryKey(t.limbId, t.threadType);
    const branch = byKey.get(key);
    if (!branch) continue;
    out.push({
      categoryId: branch.id,
      hubSlug: normalizeCategoryLabelKey(t.threadType),
      hubLabel: t.threadType,
      themeId: themeId,
      updatedAt: branch.updatedAt,
    });
  }
  return out;
}

export type CategoryResolver = {
  resolve(hubIdOrSlug: string, preferredThemeId?: LifeAreaId): string | null;
  /** Normalized taxonomy slug for theme-scoped Stream items. */
  resolveSlug(hubIdOrSlug: string, preferredThemeId?: LifeAreaId): string | null;
};

/** Resolve category ids or taxonomy slugs to canonical root category ids (handles deduped / legacy labels). */
export async function buildCategoryResolver(
  prisma: PrismaClient,
  userId: string,
): Promise<CategoryResolver> {
  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    select: {
      id: true,
      themeId: true,
      label: true,
      name: true,
      isSystemCategory: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const canonical = canonicalRootHubRows(roots);

  const byId = new Map<string, string>();
  const byThemeSlug = new Map<string, string>();
  const idToSlug = new Map<string, string>();

  for (const branch of canonical) {
    byId.set(branch.id, branch.id);
    const slug = normalizeStreamCategorySlug(branch.label ?? branch.name ?? "");
    idToSlug.set(branch.id, slug);
    byThemeSlug.set(`${branch.themeId}::${slug}`, branch.id);
  }

  function lookupId(raw: string, preferredThemeId?: LifeAreaId): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (byId.has(trimmed)) return byId.get(trimmed)!;

    const slug = normalizeStreamCategorySlug(trimmed);
    if (preferredThemeId) {
      const hit = byThemeSlug.get(`${preferredThemeId}::${slug}`);
      if (hit) return hit;
    }
    for (const themeId of LIFE_AREA_IDS) {
      const hit = byThemeSlug.get(`${themeId}::${slug}`);
      if (hit) return hit;
    }
    return null;
  }

  return {
    resolve(hubIdOrSlug: string, preferredThemeId?: LifeAreaId): string | null {
      return lookupId(hubIdOrSlug, preferredThemeId);
    },
    resolveSlug(hubIdOrSlug: string, preferredThemeId?: LifeAreaId): string | null {
      const branchId = lookupId(hubIdOrSlug, preferredThemeId);
      if (branchId) return idToSlug.get(branchId) ?? null;
      const slug = normalizeStreamCategorySlug(hubIdOrSlug);
      if (preferredThemeId && isValidHubSlugForTheme(preferredThemeId, slug)) return slug;
      for (const themeId of LIFE_AREA_IDS) {
        if (isValidHubSlugForTheme(themeId, slug)) return slug;
      }
      return null;
    },
  };
}
