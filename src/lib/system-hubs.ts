import type { Branch, PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import { LOCKED_HUB_TEMPLATES, normalizeHubLabelKey } from "@/lib/taxonomy";

function normLabel(label: string | null | undefined): string {
  return (label ?? "").trim().toLowerCase();
}

export function systemHubKey(limbId: string, label: string | null | undefined): string {
  return `${limbId}::${normalizeHubLabelKey(label ?? "")}`;
}

export function isLockedSystemHub(branch: Pick<Branch, "isSystemHub">): boolean {
  return branch.isSystemHub === true;
}

function matchesTemplate(limbId: string, label: string | null | undefined): boolean {
  const key = normalizeHubLabelKey(label ?? "");
  return LOCKED_HUB_TEMPLATES.some(
    (t) => t.limbId === limbId && normalizeHubLabelKey(t.threadType) === key,
  );
}

/**
 * Idempotently ensures all 17 locked taxonomy hubs exist for the user (dormant by default).
 * Returns the number of hubs created.
 */
export async function ensureSystemHubsForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return 0;

  const roots = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: { createdAt: "asc" },
  });

  const present = new Map<string, Branch>();
  for (const b of roots) {
    const key = systemHubKey(b.limbId, b.label ?? b.name);
    const existing = present.get(key);
    if (!existing || b.createdAt < existing.createdAt) {
      present.set(key, b);
    }
  }

  const base = Date.UTC(2026, 0, 1);
  let order = roots.length;
  let created = 0;

  for (const t of LOCKED_HUB_TEMPLATES) {
    const key = systemHubKey(t.limbId, t.threadType);
    if (present.has(key)) continue;

    await prisma.branch.create({
      data: {
        userId,
        limbId: t.limbId,
        label: t.threadType,
        name: t.name,
        status: "active",
        bloomStatus: "ACTIVE",
        isSystemHub: true,
        isActive: false,
        order,
        createdAt: new Date(base + order * 60_000),
      },
    });
    order += 1;
    created += 1;
  }

  // Mark existing taxonomy roots as system hubs without toggling isActive.
  for (const b of roots) {
    if (b.isSystemHub) continue;
    if (!matchesTemplate(b.limbId, b.label ?? b.name)) continue;
    await prisma.branch.update({
      where: { id: b.id },
      data: { isSystemHub: true },
    });
  }

  return created;
}

/** Activates every system hub under the given themes (limbs). Idempotent. */
export async function activateLimbsForUser(
  prisma: PrismaClient,
  userId: string,
  limbIds: readonly LifeAreaId[],
): Promise<number> {
  if (limbIds.length === 0) return 0;
  const result = await prisma.branch.updateMany({
    where: {
      userId,
      parentBranchId: null,
      isSystemHub: true,
      limbId: { in: [...limbIds] },
    },
    data: { isActive: true },
  });
  return result.count;
}

/** Activates a single hub row (e.g. goal assigned to a dormant hub). Idempotent. */
export async function activateHubForUser(
  prisma: PrismaClient,
  userId: string,
  branchId: string,
): Promise<boolean> {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, userId },
    select: { id: true, isActive: true },
  });
  if (!branch) return false;
  if (branch.isActive) return true;
  await prisma.branch.update({
    where: { id: branch.id },
    data: { isActive: true },
  });
  return true;
}

/** Keys of system hub slots present for a user (for tests). */
export async function listSystemHubKeysForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> {
  const rows = await prisma.branch.findMany({
    where: { userId, parentBranchId: null, isSystemHub: true },
    select: { limbId: true, label: true, name: true },
  });
  return rows.map((r) => systemHubKey(r.limbId, r.label ?? r.name));
}

export { normLabel };
