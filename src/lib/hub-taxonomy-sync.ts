import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import {
  LEGACY_HUB_MIGRATIONS,
  LOCKED_HUB_TEMPLATES,
  TAXONOMY_VERSION,
} from "@/lib/taxonomy";
import { dedupeDuplicateRootHubs } from "@/lib/hub-dedupe";
import { ensureSystemHubsForUser, isLockedSystemHub, normLabel, systemHubKey } from "@/lib/system-hubs";

export type EnsureHubTaxonomyCurrentResult = {
  skipped: boolean;
  updates: number;
};

const RENTAL_INCOME_RE =
  /\b(rent|rental|landlord|tenant|btl|buy-to-let|buy to let|property income|room let|airbnb|hmo)\b/i;
const BUSINESS_INCOME_RE =
  /\b(freelance|self[- ]?employed|sole trader|ltd|invoic|side business|consulting client|my business)\b/i;

/** Reassign pursuits from legacy Employment income bucket using title/description cues. */
async function migrateFinanceIncomeCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentBranchId: null, limbId: "finance" },
    select: { id: true, label: true, name: true, limbId: true },
  });

  const branchByKey = new Map(
    roots.map((b) => [systemHubKey(b.limbId, b.label ?? b.name), b.id]),
  );

  const employmentId = branchByKey.get(systemHubKey("finance", "Employment income"));
  const rentalId = branchByKey.get(systemHubKey("finance", "Rental & property income"));
  const businessId = branchByKey.get(systemHubKey("finance", "Business & freelance income"));
  if (!employmentId || !rentalId || !businessId) return 0;

  const goals = await prisma.goal.findMany({
    where: { userId, categoryId: employmentId, archived: false },
    select: { id: true, title: true, description: true },
  });

  let updates = 0;
  for (const goal of goals) {
    const text = `${goal.title} ${goal.description ?? ""}`;
    let target: string = employmentId;
    if (RENTAL_INCOME_RE.test(text)) {
      target = rentalId;
    } else if (BUSINESS_INCOME_RE.test(text)) {
      target = businessId;
    }
    if (target === employmentId) continue;
    await prisma.goal.update({
      where: { id: goal.id },
      data: { categoryId: target },
    });
    updates += 1;
  }
  return updates;
}

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

function resolveLegacyLimbId(limbId: string): LifeAreaId {
  return limbId as LifeAreaId;
}

/** Root-branch label sync for locked hub taxonomy. Idempotent. */
export async function syncHubTaxonomyForUser(prisma: PrismaClient, userId: string): Promise<number> {
  let updates = 0;

  updates += await ensureSystemHubsForUser(prisma, userId);

  const roots = await prisma.themeCategory.findMany({
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
    } else if (raw === "joy" && limbId === "health") {
      limbId = "becoming";
      label = "Joy & Creativity";
      name = "Joy & Creativity";
    } else if (raw === "play" && limbId === "becoming") {
      label = "Joy & Creativity";
      name = "Joy & Creativity";
    } else if (raw === "play" && limbId === "health") {
      limbId = "becoming";
      label = "Joy & Creativity";
      name = "Joy & Creativity";
    } else if (raw === "mind" && limbId === "health") {
      label = "Body & grooming";
      name = "Body & grooming";
    } else if (raw === "mind" && limbId === "becoming") {
      label = "Mind & Emotions";
      name = "Mind & Emotions";
    } else if (raw === "energy" && limbId === "health") {
      label = "Body & grooming";
      name = "Body & grooming";
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
      await prisma.themeCategory.update({
        where: { id: branch.id },
        data: patch,
      });
      updates += 1;
    }
  }

  updates += await dedupeDuplicateRootHubs(prisma, userId);

  const afterDedupe = await prisma.themeCategory.findMany({
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
    const labelKey = systemHubKey(branch.limbId, branch.label ?? branch.name).split("::")[1] ?? "";
    const valid = validHubKeysByLimb.get(branch.limbId);
    if (!labelKey || !valid || valid.has(labelKey)) continue;
    const [goalCount, markCount] = await Promise.all([
      prisma.goal.count({ where: { categoryId: branch.id } }),
      prisma.mark.count({ where: { categoryId: branch.id } }),
    ]);
    if (goalCount === 0 && markCount === 0) {
      await prisma.themeCategory.delete({ where: { id: branch.id } });
      updates += 1;
    }
  }

  updates += await ensureSystemHubsForUser(prisma, userId);
  updates += await migrateFinanceIncomeCategories(prisma, userId);

  return updates;
}
