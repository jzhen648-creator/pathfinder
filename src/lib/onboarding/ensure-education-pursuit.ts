import { getLifeArea } from "@/lib/life-areas";
import {
  buildEducationMilestoneRows,
  ONBOARDING_EDUCATION_CATEGORY_LABEL,
  ONBOARDING_EDUCATION_PURSUIT_TITLE,
  ONBOARDING_EDUCATION_THEME_ID,
  type OnboardingEducationLevel,
} from "@/lib/onboarding/education-pursuit-spec";
import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";
import { activateCategoryForUser } from "@/lib/system-categories";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { normalizeCategoryLabelKey } from "@/lib/taxonomy";
import { isLifeAreaId, unlockThemesForUser } from "@/lib/unlocked-themes";

export type EnsureEducationPursuitInput = {
  educationLevel: OnboardingEducationLevel;
  mapGridQ?: number;
  mapGridR?: number;
};

export type EnsureEducationPursuitResult = {
  goalId: string;
  created: boolean;
};

const EDUCATION_CATEGORY_KEY = normalizeCategoryLabelKey(ONBOARDING_EDUCATION_CATEGORY_LABEL);

export async function findEducationCategoryId(userId: string): Promise<string | null> {
  const categories = await prisma.themeCategory.findMany({
    where: {
      userId,
      themeId: ONBOARDING_EDUCATION_THEME_ID,
      isSystemCategory: true,
    },
    select: { id: true, label: true },
  });

  const match = categories.find(
    (row) => normalizeCategoryLabelKey(row.label ?? "") === EDUCATION_CATEGORY_KEY,
  );
  return match?.id ?? null;
}

async function syncEducationMilestones(
  goalId: string,
  educationLevel: OnboardingEducationLevel,
): Promise<void> {
  const existing = await prisma.milestone.findMany({
    where: { goalId },
    select: { position: true },
    orderBy: { position: "asc" },
  });
  const expectedPositions = buildEducationMilestoneRows(educationLevel, new Date()).map(
    (row) => row.position,
  );
  const hasExpectedShape =
    existing.length === expectedPositions.length &&
    existing.every((row, index) => row.position === expectedPositions[index]);

  if (hasExpectedShape) return;

  const completedAt = new Date();
  const rows = buildEducationMilestoneRows(educationLevel, completedAt);

  await prisma.$transaction(async (tx) => {
    await tx.milestone.deleteMany({ where: { goalId } });
    for (const row of rows) {
      await tx.milestone.create({
        data: {
          goalId,
          title: row.title,
          description: row.description,
          position: row.position,
          completedAt: row.completedAt,
        },
      });
    }
  });
}

export async function ensureEducationPursuit(
  userId: string,
  input: EnsureEducationPursuitInput,
): Promise<EnsureEducationPursuitResult> {
  await ensureTaxonomyCurrent(prisma, userId);

  const categoryId = await findEducationCategoryId(userId);
  if (!categoryId) {
    throw new Error("Education category not found for user");
  }

  await activateCategoryForUser(prisma, userId, categoryId);
  await unlockThemesForUser(prisma, userId, [ONBOARDING_EDUCATION_THEME_ID]);

  const existing = await prisma.goal.findFirst({
    where: {
      userId,
      archived: false,
      title: ONBOARDING_EDUCATION_PURSUIT_TITLE,
      themeId: ONBOARDING_EDUCATION_THEME_ID,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    await syncEducationMilestones(existing.id, input.educationLevel);
    if (input.mapGridQ !== undefined && input.mapGridR !== undefined) {
      await prisma.goal.updateMany({
        where: {
          id: existing.id,
          userId,
          OR: [{ mapGridQ: null }, { mapGridR: null }],
        },
        data: { mapGridQ: input.mapGridQ, mapGridR: input.mapGridR },
      });
    }
    return { goalId: existing.id, created: false };
  }

  const lifeArea = getLifeArea(ONBOARDING_EDUCATION_THEME_ID)?.label ?? "Other";
  const now = new Date();
  const completedAt = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const milestoneRows = buildEducationMilestoneRows(input.educationLevel, completedAt);

  const existingNodes = await loadCategorySequencedNodes(prisma, categoryId);
  const resolution = resolveSequenceAnchor(existingNodes, { kind: "append" });
  const sequencePosition = resolution.sequencePosition;

  const goal = await prisma.$transaction(async (tx) => {
    await applySequenceResolution(tx, resolution);
    const created = await tx.goal.create({
      data: {
        userId,
        title: ONBOARDING_EDUCATION_PURSUIT_TITLE,
        description: "",
        iconName: "graduation-cap",
        lifeArea,
        goalType: "project",
        categoryId,
        themeId: ONBOARDING_EDUCATION_THEME_ID,
        deadline: null,
        significance: 4,
        status: "ACTIVE",
        aiGenerated: false,
        future: true,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        sequencePosition,
        ...(input.mapGridQ !== undefined && input.mapGridR !== undefined
          ? { mapGridQ: input.mapGridQ, mapGridR: input.mapGridR }
          : {}),
      },
    });

    for (const row of milestoneRows) {
      await tx.milestone.create({
        data: {
          goalId: created.id,
          title: row.title,
          description: row.description,
          position: row.position,
          completedAt: row.completedAt,
        },
      });
    }

    return created;
  });

  if (isLifeAreaId(ONBOARDING_EDUCATION_THEME_ID)) {
    await unlockThemesForUser(prisma, userId, [ONBOARDING_EDUCATION_THEME_ID]);
  }

  await markPursuitReadingDirty(userId, goal.id, "pursuit_created", {
    details: { event: "created", title: goal.title },
  });

  return { goalId: goal.id, created: true };
}
