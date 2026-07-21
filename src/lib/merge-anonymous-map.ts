import type { Prisma } from "@prisma/client";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { systemCategoryKey } from "@/lib/system-categories";
import { parseUnlockedThemeIds } from "@/lib/unlocked-themes";

/**
 * Prisma delegates used by the merge — satisfied by both PrismaClient and
 * Prisma.TransactionClient so the route can run it inside `$transaction`
 * and tests can inject a mock.
 */
export type MergeDbClient = Pick<
  Prisma.TransactionClient,
  | "user"
  | "goal"
  | "themeCategory"
  | "pursuitContextEntry"
  | "pursuitRelationship"
  | "pursuitStatusTransition"
  | "userManualProfile"
  | "profileFact"
  | "userMemory"
  | "aiReadingDirtyItem"
>;

export type MergeAnonymousMapResult = {
  movedGoals: number;
  createdCategories: number;
};

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/**
 * Move every chapter (and its children) from an anonymous source user onto a
 * claimed target account, then delete the anonymous shell.
 *
 * Category remap: goals point at per-user `ThemeCategory` rows, so each moved
 * goal is re-pointed at the target's category with the same
 * `systemCategoryKey(themeId, label)`. Custom guest categories with no target
 * counterpart are recreated under the target.
 *
 * Profile info merges fill-if-empty (target wins): `UserManualProfile` fields,
 * `ProfileFact` rows, `unlockedLimbIds` union, `UserMemory` (moved only when
 * the target has none), and onboarding state. Target identity
 * (name/email/password) is never touched. `lastReadingDeliveredAt` is cleared
 * so the free-tier delivery gate cannot block the post-merge regeneration.
 *
 * Caller must run `ensureTaxonomyCurrent(prisma, targetUserId)` *before* the
 * transaction (slow on remote DBs) and wrap this in `prisma.$transaction`.
 */
export async function mergeAnonymousMapIntoAccount(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<MergeAnonymousMapResult> {
  if (sourceUserId === targetUserId) {
    throw new Error("Cannot merge a user into itself.");
  }

  const [sourceCategories, targetCategories, sourceGoals] = await Promise.all([
    db.themeCategory.findMany({
      where: { userId: sourceUserId },
      select: { id: true, themeId: true, label: true, isSystemCategory: true },
    }),
    db.themeCategory.findMany({
      where: { userId: targetUserId },
      select: { id: true, themeId: true, label: true, isActive: true },
    }),
    db.goal.findMany({
      where: { userId: sourceUserId },
      select: { id: true, categoryId: true },
    }),
  ]);

  const sourceCategoryById = new Map(sourceCategories.map((c) => [c.id, c]));
  const targetCategoryByKey = new Map(
    targetCategories.map((c) => [systemCategoryKey(c.themeId, c.label), c]),
  );

  // Distinct source categories actually holding goals.
  const usedSourceCategoryIds = [
    ...new Set(
      sourceGoals
        .map((g) => g.categoryId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  let createdCategories = 0;
  let targetOrder = targetCategories.length;
  const receivingCategoryIds: string[] = [];
  const categoryIdRemap = new Map<string, string>();

  for (const sourceCategoryId of usedSourceCategoryIds) {
    const sourceCategory = sourceCategoryById.get(sourceCategoryId);
    if (!sourceCategory) continue;
    const key = systemCategoryKey(sourceCategory.themeId, sourceCategory.label);
    let target = targetCategoryByKey.get(key);
    if (!target) {
      // Custom guest category with no counterpart — recreate under target.
      const created = await db.themeCategory.create({
        data: {
          userId: targetUserId,
          themeId: sourceCategory.themeId,
          label: sourceCategory.label,
          status: "active",
          lifecycleStatus: "ACTIVE",
          isSystemCategory: false,
          isActive: true,
          order: targetOrder,
        },
        select: { id: true, themeId: true, label: true, isActive: true },
      });
      targetOrder += 1;
      createdCategories += 1;
      target = created;
      targetCategoryByKey.set(key, created);
    }
    categoryIdRemap.set(sourceCategoryId, target.id);
    receivingCategoryIds.push(target.id);
  }

  // Custom guest categories that hold no goals right now (e.g. created and
  // then emptied) would otherwise be cascade-deleted with the source user.
  const usedSourceCategoryIdSet = new Set(usedSourceCategoryIds);
  for (const sourceCategory of sourceCategories) {
    if (usedSourceCategoryIdSet.has(sourceCategory.id)) continue;
    if (sourceCategory.isSystemCategory) continue;
    const key = systemCategoryKey(sourceCategory.themeId, sourceCategory.label);
    if (targetCategoryByKey.has(key)) continue;
    const created = await db.themeCategory.create({
      data: {
        userId: targetUserId,
        themeId: sourceCategory.themeId,
        label: sourceCategory.label,
        status: "active",
        lifecycleStatus: "ACTIVE",
        isSystemCategory: false,
        isActive: true,
        order: targetOrder,
      },
      select: { id: true, themeId: true, label: true, isActive: true },
    });
    targetOrder += 1;
    createdCategories += 1;
    targetCategoryByKey.set(key, created);
  }

  // Move goals per source category (disjoint filters — order does not matter).
  let movedGoals = 0;
  for (const [sourceCategoryId, targetCategoryId] of categoryIdRemap) {
    const moved = await db.goal.updateMany({
      where: { userId: sourceUserId, categoryId: sourceCategoryId },
      data: { userId: targetUserId, categoryId: targetCategoryId },
    });
    movedGoals += moved.count;
  }
  const movedUncategorized = await db.goal.updateMany({
    where: { userId: sourceUserId },
    data: { userId: targetUserId },
  });
  movedGoals += movedUncategorized.count;

  if (receivingCategoryIds.length > 0) {
    await db.themeCategory.updateMany({
      where: { id: { in: receivingCategoryIds }, isActive: false },
      data: { isActive: true },
    });
  }

  // Child rows keyed by userId follow their goals. Milestones follow goalId.
  await db.pursuitContextEntry.updateMany({
    where: { userId: sourceUserId },
    data: { userId: targetUserId },
  });
  await db.pursuitRelationship.updateMany({
    where: { userId: sourceUserId },
    data: { userId: targetUserId },
  });
  await db.pursuitStatusTransition.updateMany({
    where: { userId: sourceUserId },
    data: { userId: targetUserId },
  });

  await mergeManualProfileFillIfEmpty(db, sourceUserId, targetUserId);
  await mergeProfileFacts(db, sourceUserId, targetUserId);
  await mergeUnlockedThemes(db, sourceUserId, targetUserId);
  await mergeUserMemoryFillIfEmpty(db, sourceUserId, targetUserId);
  await mergeUserOnboardingAndResetDeliveryGate(db, sourceUserId, targetUserId);

  // Readings must regenerate including the merged chapters.
  await db.aiReadingDirtyItem.upsert({
    where: {
      userId_entityType_entityId: {
        userId: targetUserId,
        entityType: "global",
        entityId: "map",
      },
    },
    create: {
      userId: targetUserId,
      entityType: "global",
      entityId: "map",
      reason: "anonymous_map_merged",
    },
    update: { reason: "anonymous_map_merged", createdAt: new Date() },
  });

  // Straggler re-check: any goal written for the source between the initial
  // read and here (e.g. a concurrent create racing the merge) must not be
  // cascade-deleted with the source user.
  const stragglers = await db.goal.updateMany({
    where: { userId: sourceUserId },
    data: { userId: targetUserId },
  });
  movedGoals += stragglers.count;

  // Cascade clears the source's now goal-free taxonomy, caches, and telemetry.
  await db.user.delete({ where: { id: sourceUserId } });

  return { movedGoals, createdCategories };
}

/**
 * Move the guest's AI-observed memory onto the target when the target has
 * none — otherwise it would be cascade-deleted with the source user.
 * A target with its own memory always wins (never overwritten).
 */
async function mergeUserMemoryFillIfEmpty(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const source = await db.userMemory.findUnique({ where: { userId: sourceUserId } });
  if (!source || isBlank(source.blob)) return;

  const target = await db.userMemory.findUnique({ where: { userId: targetUserId } });
  if (target && !isBlank(target.blob)) return;

  if (!target) {
    await db.userMemory.create({
      data: {
        userId: targetUserId,
        blob: source.blob,
        version: source.version,
        isDirty: source.isDirty,
        lastUserEditedAt: source.lastUserEditedAt,
      },
    });
    return;
  }

  await db.userMemory.update({
    where: { userId: targetUserId },
    data: {
      blob: source.blob,
      isDirty: source.isDirty,
      lastUserEditedAt: source.lastUserEditedAt,
    },
  });
}

/**
 * Carry over guest onboarding progress (fill-if-empty — target wins) and
 * clear `lastReadingDeliveredAt` so the post-merge regeneration is not
 * blocked by the free-tier delivery gate.
 */
async function mergeUserOnboardingAndResetDeliveryGate(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const [source, target] = await Promise.all([
    db.user.findUnique({
      where: { id: sourceUserId },
      select: { onboardingCompleted: true, onboardingThemeId: true },
    }),
    db.user.findUnique({
      where: { id: targetUserId },
      select: { onboardingCompleted: true, onboardingThemeId: true },
    }),
  ]);

  const patch: Prisma.UserUpdateInput = { lastReadingDeliveredAt: null };
  if (source?.onboardingCompleted && target && !target.onboardingCompleted) {
    patch.onboardingCompleted = true;
  }
  if (source?.onboardingThemeId != null && target && target.onboardingThemeId == null) {
    patch.onboardingThemeId = source.onboardingThemeId;
  }

  await db.user.update({ where: { id: targetUserId }, data: patch });
}

async function mergeManualProfileFillIfEmpty(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const source = await db.userManualProfile.findUnique({
    where: { userId: sourceUserId },
  });
  if (!source) return;

  const target = await db.userManualProfile.findUnique({
    where: { userId: targetUserId },
  });

  if (!target) {
    await db.userManualProfile.create({
      data: {
        userId: targetUserId,
        displayName: source.displayName,
        dateOfBirth: source.dateOfBirth,
        location: source.location,
        languages: source.languages,
        occupation: source.occupation,
        educationLevel: source.educationLevel,
        employmentStatus: source.employmentStatus,
        industry: source.industry,
        jobTitle: source.jobTitle,
        currencyCode: source.currencyCode,
        measurementSystem: source.measurementSystem,
      },
    });
    return;
  }

  const patch: Prisma.UserManualProfileUpdateInput = {};
  if (isBlank(target.displayName) && !isBlank(source.displayName)) {
    patch.displayName = source.displayName;
  }
  if (target.dateOfBirth == null && source.dateOfBirth != null) {
    patch.dateOfBirth = source.dateOfBirth;
  }
  if (isBlank(target.location) && !isBlank(source.location)) {
    patch.location = source.location;
  }
  if (target.languages.length === 0 && source.languages.length > 0) {
    patch.languages = source.languages;
  }
  if (isBlank(target.occupation) && !isBlank(source.occupation)) {
    patch.occupation = source.occupation;
  }
  if (isBlank(target.educationLevel) && !isBlank(source.educationLevel)) {
    patch.educationLevel = source.educationLevel;
  }
  if (isBlank(target.employmentStatus) && !isBlank(source.employmentStatus)) {
    patch.employmentStatus = source.employmentStatus;
  }
  if (isBlank(target.industry) && !isBlank(source.industry)) {
    patch.industry = source.industry;
  }
  if (isBlank(target.jobTitle) && !isBlank(source.jobTitle)) {
    patch.jobTitle = source.jobTitle;
  }
  if (isBlank(target.currencyCode) && !isBlank(source.currencyCode)) {
    patch.currencyCode = source.currencyCode;
  }
  if (isBlank(target.measurementSystem) && !isBlank(source.measurementSystem)) {
    patch.measurementSystem = source.measurementSystem;
  }

  if (Object.keys(patch).length > 0) {
    await db.userManualProfile.update({
      where: { userId: targetUserId },
      data: patch,
    });
  }
}

async function mergeProfileFacts(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const facts = await db.profileFact.findMany({
    where: { userId: sourceUserId },
    select: {
      category: true,
      key: true,
      value: true,
      confidence: true,
      source: true,
    },
  });
  if (facts.length === 0) return;

  await db.profileFact.createMany({
    data: facts.map((fact) => ({ ...fact, userId: targetUserId })),
    skipDuplicates: true,
  });
}

async function mergeUnlockedThemes(
  db: MergeDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<void> {
  const [source, target] = await Promise.all([
    db.user.findUnique({
      where: { id: sourceUserId },
      select: { unlockedLimbIds: true },
    }),
    db.user.findUnique({
      where: { id: targetUserId },
      select: { unlockedLimbIds: true },
    }),
  ]);

  const sourceIds = parseUnlockedThemeIds(source?.unlockedLimbIds);
  if (sourceIds.length === 0) return;
  const targetIds = parseUnlockedThemeIds(target?.unlockedLimbIds);

  const union = new Set([...targetIds, ...sourceIds]);
  if (union.size === targetIds.length) return;

  await db.user.update({
    where: { id: targetUserId },
    data: { unlockedLimbIds: LIFE_AREA_IDS.filter((id) => union.has(id)) },
  });
}
