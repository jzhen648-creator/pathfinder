import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import {
  LEGACY_HUB_MIGRATIONS,
  LOCKED_HUB_TEMPLATES,
  TAXONOMY_VERSION,
} from "@/lib/taxonomy";
import { ensureSystemHubsForUser, isLockedSystemHub, normLabel } from "@/lib/system-hubs";

export type EnsureHubTaxonomyCurrentResult = {
  skipped: boolean;
  updates: number;
};

/** Runs full hub sync when {@link User.hubTaxonomyVersion} !== {@link TAXONOMY_VERSION}; stamps on success. */
export async function ensureHubTaxonomyCurrent(
  prisma: PrismaClient,
  userId: string,
): Promise<EnsureHubTaxonomyCurrentResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hubTaxonomyVersion: true },
  });
  if (!user) throw new Error(`User not found: ${userId}`);

  if (user.hubTaxonomyVersion === TAXONOMY_VERSION) {
    return { skipped: true, updates: 0 };
  }

  const updates = await syncHubTaxonomyForUser(prisma, userId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      hubTaxonomyVersion: TAXONOMY_VERSION,
      hubTaxonomySyncedAt: new Date(),
    },
  });

  return { skipped: false, updates };
}

/** Retired sixth theme — re-home any surviving rows under Who I'm Becoming / Joy. */
function resolveLegacyLimbId(limbId: string): LifeAreaId {
  return limbId === "pleasures" ? "becoming" : (limbId as LifeAreaId);
}

/** Root-branch label sync for locked hub taxonomy. Idempotent. */
export async function syncHubTaxonomyForUser(prisma: PrismaClient, userId: string): Promise<number> {
  let updates = 0;

  updates += await ensureSystemHubsForUser(prisma, userId);

  const roots = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: { createdAt: "asc" },
  });

  for (const branch of roots) {
    const raw = normLabel(branch.label ?? branch.name);
    let limbId = resolveLegacyLimbId(branch.limbId);
    let label = (branch.label ?? branch.name ?? "").trim();
    let name = (branch.name ?? branch.label ?? "").trim();

    const legacy = LEGACY_HUB_MIGRATIONS[raw];
    if (legacy) {
      limbId = legacy.limbId;
      label = legacy.label;
      name = legacy.label;
    } else if (branch.limbId === "pleasures") {
      limbId = "becoming";
      label = label || "Joy";
      name = name || label;
    } else if (raw === "joy" && limbId === "health") {
      limbId = "becoming";
      label = "Joy";
      name = "Joy";
    } else if (raw === "play" && limbId === "becoming") {
      label = "Joy";
      name = "Joy";
    } else if (raw === "play" && limbId === "health") {
      limbId = "becoming";
      label = "Joy";
      name = "Joy";
    } else if (raw === "mind" && limbId === "health") {
      label = "Appearance";
      name = "Appearance";
    } else if (raw === "mind" && limbId === "becoming") {
      label = "Inner life";
      name = "Inner life";
    } else if (raw === "energy" && limbId === "health") {
      label = "Appearance";
      name = "Appearance";
    }

    const template = LOCKED_HUB_TEMPLATES.find(
      (t) => t.limbId === limbId && normLabel(t.threadType) === normLabel(label),
    );
    const patch: {
      limbId?: LifeAreaId;
      label?: string;
      name?: string;
      isSystemHub?: boolean;
    } = {};
    if (template) {
      label = template.threadType;
      name = template.name;
      patch.isSystemHub = true;
    }
    if (limbId !== branch.limbId) patch.limbId = limbId;
    if (label !== (branch.label ?? "")) patch.label = label;
    if (name !== (branch.name ?? "")) patch.name = name;

    if (Object.keys(patch).length > 0) {
      await prisma.branch.update({
        where: { id: branch.id },
        data: patch,
      });
      updates += 1;
    }
  }

  const refreshed = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof refreshed>();
  for (const b of refreshed) {
    const key = `${b.limbId}::${normLabel(b.label ?? b.name)}`;
    const list = groups.get(key) ?? [];
    list.push(b);
    groups.set(key, list);
  }

  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    const [keeper, ...dupes] = list;
    for (const dup of dupes) {
      await prisma.goal.updateMany({ where: { branchId: dup.id }, data: { branchId: keeper.id } });
      await prisma.mark.updateMany({ where: { branchId: dup.id }, data: { branchId: keeper.id } });
      if (!keeper.isSystemHub && dup.isSystemHub) {
        await prisma.branch.update({
          where: { id: keeper.id },
          data: { isSystemHub: true, isActive: keeper.isActive || dup.isActive },
        });
      }
      await prisma.branch.delete({ where: { id: dup.id } });
      updates += 1;
    }
  }

  const afterDedupe = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: { createdAt: "asc" },
  });

  const validHubKeysByLimb = new Map<string, Set<string>>();
  for (const t of LOCKED_HUB_TEMPLATES) {
    const set = validHubKeysByLimb.get(t.limbId) ?? new Set<string>();
    set.add(normLabel(t.threadType));
    validHubKeysByLimb.set(t.limbId, set);
  }

  for (const branch of afterDedupe) {
    if (isLockedSystemHub(branch)) continue;
    const labelKey = normLabel(branch.label ?? branch.name);
    const valid = validHubKeysByLimb.get(branch.limbId);
    if (!labelKey || !valid || valid.has(labelKey)) continue;
    const [goalCount, markCount] = await Promise.all([
      prisma.goal.count({ where: { branchId: branch.id } }),
      prisma.mark.count({ where: { branchId: branch.id } }),
    ]);
    if (goalCount === 0 && markCount === 0) {
      await prisma.branch.delete({ where: { id: branch.id } });
      updates += 1;
    }
  }

  updates += await ensureSystemHubsForUser(prisma, userId);

  return updates;
}
