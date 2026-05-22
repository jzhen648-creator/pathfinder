import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import {
  hubsForTheme,
  normalizeHubLabelKey,
  validHubLabelKeysForTheme,
} from "@/lib/taxonomy";
import { systemHubKey } from "@/lib/system-hubs";

export type ResolvedHubBranch = {
  branchId: string;
  hubSlug: string;
  hubLabel: string;
  limbId: LifeAreaId;
  updatedAt?: Date;
};

export function normalizeStreamHubSlug(hubSlugOrLabel: string): string {
  return normalizeHubLabelKey(hubSlugOrLabel);
}

export function isValidHubSlugForTheme(themeId: LifeAreaId, hubSlug: string): boolean {
  const key = normalizeStreamHubSlug(hubSlug);
  return validHubLabelKeysForTheme(themeId).has(key);
}

export function resolveHubTemplateForSlug(themeId: LifeAreaId, hubSlug: string) {
  const key = normalizeStreamHubSlug(hubSlug);
  return (
    hubsForTheme(themeId).find((t) => normalizeHubLabelKey(t.threadType) === key) ?? null
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
): Promise<ResolvedHubBranch | null> {
  const hubSlugNorm = normalizeStreamHubSlug(hubSlug);
  if (!isValidHubSlugForTheme(themeId, hubSlugNorm)) {
    return null;
  }

  const template = resolveHubTemplateForSlug(themeId, hubSlugNorm);
  if (!template) return null;

  const roots = await prisma.branch.findMany({
    where: { userId, limbId: themeId, parentBranchId: null },
    select: { id: true, label: true, name: true, limbId: true, updatedAt: true },
  });

  const match = roots.find(
    (b) => systemHubKey(b.limbId, b.label ?? b.name) === systemHubKey(themeId, template.threadType),
  );
  if (!match) return null;

  return {
    branchId: match.id,
    hubSlug: hubSlugNorm,
    hubLabel: template.threadType,
    limbId: themeId,
    updatedAt: match.updatedAt,
  };
}

/** All taxonomy hub slugs for a theme with resolved branch ids (skips missing branches). */
export async function resolveAllHubBranchesForTheme(
  prisma: PrismaClient,
  userId: string,
  themeId: LifeAreaId,
): Promise<ResolvedHubBranch[]> {
  const templates = hubsForTheme(themeId);
  const roots = await prisma.branch.findMany({
    where: { userId, limbId: themeId, parentBranchId: null },
    select: { id: true, label: true, name: true, limbId: true, updatedAt: true },
  });

  const byKey = new Map<string, (typeof roots)[number]>();
  for (const b of roots) {
    byKey.set(systemHubKey(b.limbId, b.label ?? b.name), b);
  }

  const out: ResolvedHubBranch[] = [];
  for (const t of templates) {
    const key = systemHubKey(t.limbId, t.threadType);
    const branch = byKey.get(key);
    if (!branch) continue;
    out.push({
      branchId: branch.id,
      hubSlug: normalizeHubLabelKey(t.threadType),
      hubLabel: t.threadType,
      limbId: themeId,
      updatedAt: branch.updatedAt,
    });
  }
  return out;
}
