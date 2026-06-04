import type { Branch, PrismaClient } from "@prisma/client";
import { LOCKED_HUB_TEMPLATES, normalizeHubLabelKey } from "@/lib/taxonomy";
import { isLockedSystemHub, systemHubKey } from "@/lib/system-hubs";

function matchesTemplate(limbId: string, label: string | null | undefined): boolean {
  const key = normalizeHubLabelKey(label ?? "");
  return LOCKED_HUB_TEMPLATES.some(
    (t) => t.limbId === limbId && normalizeHubLabelKey(t.threadType) === key,
  );
}

/** Prefer canonical template label, then system hub, then oldest row. */
function pickKeeperHub(list: readonly Branch[]): Branch {
  return [...list].sort((a, b) => {
    const aTemplate = matchesTemplate(a.limbId, a.label ?? a.name) ? 0 : 1;
    const bTemplate = matchesTemplate(b.limbId, b.label ?? b.name) ? 0 : 1;
    if (aTemplate !== bTemplate) return aTemplate - bTemplate;
    const aSystem = isLockedSystemHub(a) ? 0 : 1;
    const bSystem = isLockedSystemHub(b) ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

/**
 * Merges duplicate root hubs that share the same canonical slot (e.g. Purpose + Purpose & Values).
 * Idempotent; safe to run on every branches read.
 */
export async function dedupeDuplicateRootHubs(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  let updates = 0;

  const roots = await prisma.branch.findMany({
    where: { userId, parentBranchId: null },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, Branch[]>();
  for (const branch of roots) {
    const key = systemHubKey(branch.limbId, branch.label ?? branch.name);
    const list = groups.get(key) ?? [];
    list.push(branch);
    groups.set(key, list);
  }

  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    const keeper = pickKeeperHub(list);
    const dupes = list.filter((b) => b.id !== keeper.id);
    for (const dup of dupes) {
      await prisma.goal.updateMany({ where: { branchId: dup.id }, data: { branchId: keeper.id } });
      await prisma.mark.updateMany({ where: { branchId: dup.id }, data: { branchId: keeper.id } });
      if (!keeper.isSystemHub && dup.isSystemHub) {
        await prisma.branch.update({
          where: { id: keeper.id },
          data: { isSystemHub: true, isActive: keeper.isActive || dup.isActive },
        });
      }
      const canonicalKey = normalizeHubLabelKey(keeper.label ?? keeper.name);
      const template = LOCKED_HUB_TEMPLATES.find(
        (t) => t.limbId === keeper.limbId && normalizeHubLabelKey(t.threadType) === canonicalKey,
      );
      if (template && (keeper.label !== template.threadType || keeper.name !== template.name)) {
        await prisma.branch.update({
          where: { id: keeper.id },
          data: { label: template.threadType, name: template.name, isSystemHub: true },
        });
      }
      await prisma.branch.delete({ where: { id: dup.id } });
      updates += 1;
    }
  }

  return updates;
}
