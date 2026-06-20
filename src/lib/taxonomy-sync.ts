import type { PrismaClient } from "@prisma/client";
import type { LifeAreaId } from "@/lib/types";
import {
  LEGACY_HUB_MIGRATIONS,
  LOCKED_CATEGORY_TEMPLATES,
  TAXONOMY_VERSION,
} from "@/lib/taxonomy";
import { dedupeDuplicateRootCategories } from "@/lib/category-dedupe";
import { ensureSystemCategoriesForUser, isLockedSystemCategory, normLabel, systemCategoryKey } from "@/lib/system-categories";

export type EnsureTaxonomyCurrentResult = {
  skipped: boolean;
  updates: number;
};

const RENTAL_INCOME_RE =
  /\b(rent|rental|landlord|tenant|btl|buy-to-let|buy to let|property income|room let|airbnb|hmo)\b/i;
const BUSINESS_INCOME_RE =
  /\b(freelance|self[- ]?employed|sole trader|ltd|invoic|side business|consulting client|my business)\b/i;

const QUALIFICATIONS_RE =
  /\b(cemap|certification|certificate|qualification|license|licence|credential|exam|chartered|accreditation|professional exam|licensed)\b/i;
const EDUCATION_RE =
  /\b(course|degree|university|mba|bootcamp|module|class|study|learn|learning|training programme|training program|udemy|masterclass|speaking|toastmasters)\b/i;

const JOY_LEISURE_RE =
  /\b(guitar|paint|hobby|game|craft|trip|festival|film|book|fiction|music|travel|collect|vinyl|board game|leisure|fun)\b/i;

/** Reassign pursuits from legacy Employment income bucket using title/description cues. */
async function migrateFinanceIncomeCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null, themeId: "finance" },
    select: { id: true, label: true, name: true, themeId: true },
  });

  const branchByKey = new Map(
    roots.map((b) => [systemCategoryKey(b.themeId, b.label ?? b.name), b.id]),
  );

  const employmentId =
    branchByKey.get(systemCategoryKey("finance", "Pay from work")) ??
    branchByKey.get(systemCategoryKey("finance", "Employment income"));
  const rentalId =
    branchByKey.get(systemCategoryKey("finance", "Property income")) ??
    branchByKey.get(systemCategoryKey("finance", "Rental & property income"));
  const businessId =
    branchByKey.get(systemCategoryKey("finance", "Business & freelance")) ??
    branchByKey.get(systemCategoryKey("finance", "Business & freelance income"));
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

/** Split legacy Skills & learning pursuits into Qualifications vs Education & courses. */
async function migrateWorkSkillsCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null, themeId: "work" },
    select: { id: true, label: true, name: true, themeId: true },
  });

  const branchByKey = new Map(
    roots.map((b) => [systemCategoryKey(b.themeId, b.label ?? b.name), b.id]),
  );

  const skillsId =
    branchByKey.get(systemCategoryKey("work", "Skills & learning")) ??
    branchByKey.get(systemCategoryKey("work", "Qualifications"));
  const qualificationsId = branchByKey.get(systemCategoryKey("work", "Qualifications"));
  const educationId = branchByKey.get(systemCategoryKey("work", "Education & courses"));
  if (!skillsId || !qualificationsId || !educationId) return 0;
  if (skillsId === qualificationsId && skillsId === educationId) return 0;

  const goals = await prisma.goal.findMany({
    where: { userId, categoryId: skillsId, archived: false },
    select: { id: true, title: true, description: true },
  });

  let updates = 0;
  for (const goal of goals) {
    const text = `${goal.title} ${goal.description ?? ""}`;
    let target = qualificationsId;
    if (EDUCATION_RE.test(text) && !QUALIFICATIONS_RE.test(text)) {
      target = educationId;
    } else if (QUALIFICATIONS_RE.test(text)) {
      target = qualificationsId;
    }
    if (target === skillsId) continue;
    await prisma.goal.update({
      where: { id: goal.id },
      data: { categoryId: target },
    });
    updates += 1;
  }
  return updates;
}

/** Retire Joy & Creativity — leisure → Play; inner work stays on Mind & wellbeing. */
async function migrateRetireJoyCreativity(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    select: { id: true, label: true, name: true, themeId: true },
  });

  const branchByKey = new Map(
    roots.map((b) => [systemCategoryKey(b.themeId, b.label ?? b.name), b.id]),
  );

  const joyId = roots.find(
    (b) =>
      b.themeId === "becoming" &&
      normLabel(b.label ?? b.name) === normLabel("Joy & Creativity"),
  )?.id;
  const mindId = branchByKey.get(systemCategoryKey("becoming", "Mind & wellbeing"));
  const hobbiesId = branchByKey.get(systemCategoryKey("pleasures", "Hobbies & making"));
  const cultureId = branchByKey.get(systemCategoryKey("pleasures", "Books, film & culture"));
  const tripsId = branchByKey.get(systemCategoryKey("pleasures", "Trips & events"));
  if (!joyId || !mindId) return 0;

  const goals = await prisma.goal.findMany({
    where: { userId, categoryId: joyId, archived: false },
    select: { id: true, title: true, description: true, themeId: true },
  });

  let updates = 0;
  for (const goal of goals) {
    const text = `${goal.title} ${goal.description ?? ""}`;
    let categoryId = mindId;
    let themeId: LifeAreaId = "becoming";

    if (/\b(read|book|fiction|film|music|culture|watch|listen)\b/i.test(text) && cultureId) {
      categoryId = cultureId;
      themeId = "pleasures";
    } else if (/\b(trip|travel|festival|event|holiday|vacation)\b/i.test(text) && tripsId) {
      categoryId = tripsId;
      themeId = "pleasures";
    } else if (JOY_LEISURE_RE.test(text) && hobbiesId) {
      categoryId = hobbiesId;
      themeId = "pleasures";
    }

    await prisma.goal.update({
      where: { id: goal.id },
      data: { categoryId, themeId },
    });
    updates += 1;
  }
  return updates;
}

/** Runs full taxonomy sync when {@link User.taxonomyVersion} !== {@link TAXONOMY_VERSION}; stamps on success. */
export async function ensureTaxonomyCurrent(
  prisma: PrismaClient,
  userId: string,
): Promise<EnsureTaxonomyCurrentResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { taxonomyVersion: true },
  });
  if (!user) throw new Error(`User not found: ${userId}`);

  if (user.taxonomyVersion === TAXONOMY_VERSION) {
    return { skipped: true, updates: 0 };
  }

  const updates = await syncTaxonomyForUser(prisma, userId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      taxonomyVersion: TAXONOMY_VERSION,
      taxonomySyncedAt: new Date(),
    },
  });

  return { skipped: false, updates };
}

function resolveLegacyLimbId(limbId: string): LifeAreaId {
  return limbId as LifeAreaId;
}

/** Root-branch label sync for locked category taxonomy. Idempotent. */
export async function syncTaxonomyForUser(prisma: PrismaClient, userId: string): Promise<number> {
  let updates = 0;

  updates += await migrateRetireJoyCreativity(prisma, userId);
  updates += await migrateWorkSkillsCategories(prisma, userId);

  updates += await ensureSystemCategoriesForUser(prisma, userId);

  const roots = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    orderBy: { createdAt: "asc" },
  });

  for (const branch of roots) {
    const raw = normLabel(branch.label ?? branch.name);
    let limbId = resolveLegacyLimbId(branch.themeId);
    let label = (branch.label ?? branch.name ?? "").trim();
    let name = (branch.name ?? branch.label ?? "").trim();

    const legacy = LEGACY_HUB_MIGRATIONS[raw];
    if (legacy) {
      limbId = legacy.limbId;
      label = legacy.label;
      name = legacy.label;
    } else if (raw === "joy" && limbId === "health") {
      limbId = "becoming";
      label = "Mind & wellbeing";
      name = "Mind & wellbeing";
    } else if (raw === "play" && limbId === "becoming") {
      limbId = "pleasures";
      label = "Hobbies & making";
      name = "Hobbies & making";
    } else if (raw === "play" && limbId === "health") {
      limbId = "pleasures";
      label = "Hobbies & making";
      name = "Hobbies & making";
    } else if (raw === "mind" && limbId === "health") {
      label = "Body care";
      name = "Body care";
    } else if (raw === "mind" && limbId === "becoming") {
      label = "Mind & wellbeing";
      name = "Mind & wellbeing";
    } else if (raw === "energy" && limbId === "health") {
      label = "Body care";
      name = "Body care";
    }

    const template = LOCKED_CATEGORY_TEMPLATES.find(
      (t) => t.limbId === limbId && normLabel(t.threadType) === normLabel(label),
    );
    const patch: {
      themeId?: LifeAreaId;
      label?: string;
      name?: string;
      isSystemCategory?: boolean;
    } = {};
    if (template) {
      label = template.threadType;
      name = template.name;
      patch.isSystemCategory = true;
    }
    if (limbId !== branch.themeId) patch.themeId = limbId;
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

  updates += await dedupeDuplicateRootCategories(prisma, userId);

  const afterDedupe = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null },
    orderBy: { createdAt: "asc" },
  });

  const validCategoryKeysByLimb = new Map<string, Set<string>>();
  for (const t of LOCKED_CATEGORY_TEMPLATES) {
    const set = validCategoryKeysByLimb.get(t.limbId) ?? new Set<string>();
    set.add(normLabel(t.threadType));
    validCategoryKeysByLimb.set(t.limbId, set);
  }

  for (const branch of afterDedupe) {
    if (isLockedSystemCategory(branch)) continue;
    const labelKey = systemCategoryKey(branch.themeId, branch.label ?? branch.name).split("::")[1] ?? "";
    const valid = validCategoryKeysByLimb.get(branch.themeId);
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

  updates += await ensureSystemCategoriesForUser(prisma, userId);
  updates += await migrateFinanceIncomeCategories(prisma, userId);

  return updates;
}

export type EnsureHubTaxonomyCurrentResult = EnsureTaxonomyCurrentResult;
export const ensureHubTaxonomyCurrent = ensureTaxonomyCurrent;
export const syncHubTaxonomyForUser = syncTaxonomyForUser;
