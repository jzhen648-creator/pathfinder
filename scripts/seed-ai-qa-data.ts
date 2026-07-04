import type { Prisma, PrismaClient, PursuitStatus } from "@prisma/client";
import type { EnrichAnswer } from "../src/lib/pursuit/pursuit-enrich-types";
import type { LifeAreaId } from "../src/lib/types";
import { getLifeArea } from "../src/lib/life-areas";
import { markGlobalReadingDirty, markPursuitReadingDirty } from "../src/lib/map/reading-dirty-ledger";
import {
  activateCategoryForUser,
  activateLimbsForUser,
  systemCategoryKey,
} from "../src/lib/system-categories";
import { normalizeRelationshipPair } from "../src/lib/pursuit/pursuit-context-log";
import { ensureTaxonomyCurrent } from "../src/lib/taxonomy-sync";
import { unlockThemesForUser } from "../src/lib/unlocked-themes";
import { ORIENTATION_FACT_KEY } from "../src/lib/ai/format-user-context";

export const SEED_EMAILS = ["alex@qa-seed.test", "sam@qa-seed.test"] as const;

export type MilestoneSpec = {
  title: string;
  completed: boolean;
  completedDaysAgo?: number;
  completedOn?: string;
};

export type PursuitSpec = {
  title: string;
  themeId: LifeAreaId;
  categoryLabel: string;
  status: PursuitStatus;
  significance: number;
  /** User-authored context — mobile About tab + AI map_context. */
  background?: string;
  deadlineDaysFromNow?: number;
  deadlineOn?: string;
  completedDaysAgo?: number;
  completedOn?: string;
  timelineStartDaysAgo?: number;
  timelineStartOn?: string;
  targetAmount?: number;
  currentAmount?: number;
  unit?: string;
  amountBasis?: "gross" | "net";
  enrichAnswers?: EnrichAnswer[];
  mapGridQ: number;
  mapGridR: number;
  milestones?: MilestoneSpec[];
};

export type RelationshipSpec = {
  titleA: string;
  titleB: string;
  label?: string;
};

export type QaProfileConfig = {
  email: string;
  displayName: string;
  age: number;
  location: string;
  educationLevel?: string | null;
  employmentStatus?: string | null;
  industry?: string | null;
  jobTitle?: string | null;
  orientation?: string | null;
  unlockThemes: readonly LifeAreaId[];
  pursuits: readonly PursuitSpec[];
  relationships?: readonly RelationshipSpec[];
  /** Mark all chapters dirty so Reading tab invites first sync. */
  markReadingDirty?: boolean;
};

export const ALEX_PROFILE: QaProfileConfig = {
  email: "alex@qa-seed.test",
  displayName: "Alex Carter",
  age: 31,
  location: "United Kingdom",
  educationLevel: "higher",
  employmentStatus: "EMPLOYED",
  industry: "Finance",
  jobTitle: "Mortgage Advisor",
  unlockThemes: ["work", "finance", "people", "becoming", "health", "pleasures"],
  pursuits: [],
  markReadingDirty: true,
};

export const SAM_PROFILE: QaProfileConfig = {
  email: "sam@qa-seed.test",
  displayName: "Sam Chen",
  age: 27,
  location: "United Kingdom",
  educationLevel: "secondary",
  employmentStatus: "STUDENT",
  unlockThemes: ["work"],
  pursuits: [],
  markReadingDirty: true,
};

export function parseUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

export function dateOfBirthForAge(age: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, 5, 15));
}

export async function findSystemCategory(
  prisma: PrismaClient,
  userId: string,
  themeId: LifeAreaId,
  categoryLabel: string,
): Promise<string> {
  const key = systemCategoryKey(themeId, categoryLabel);
  const rows = await prisma.themeCategory.findMany({
    where: { userId, themeId },
    select: { id: true, label: true },
  });
  const match = rows.find((r) => systemCategoryKey(themeId, r.label) === key);
  if (!match) {
    throw new Error(`Category not found for ${themeId} :: ${categoryLabel} (key ${key})`);
  }
  return match.id;
}

export async function insertPursuit(
  prisma: PrismaClient,
  userId: string,
  spec: PursuitSpec,
  categoryId: string,
  sequencePosition: number,
): Promise<string> {
  const lifeArea = getLifeArea(spec.themeId)?.label ?? "Other";
  const now = new Date();
  const deadline =
    spec.deadlineOn != null
      ? parseUtcDate(spec.deadlineOn)
      : spec.deadlineDaysFromNow != null
        ? daysFromNow(spec.deadlineDaysFromNow)
        : null;
  const completedAt =
    spec.completedOn != null
      ? parseUtcDate(spec.completedOn)
      : spec.completedDaysAgo != null
        ? daysAgo(spec.completedDaysAgo)
        : spec.status === "COMPLETE"
          ? now
          : null;
  const timelineStart =
    spec.timelineStartOn != null
      ? parseUtcDate(spec.timelineStartOn)
      : spec.timelineStartDaysAgo != null
        ? daysAgo(spec.timelineStartDaysAgo)
        : null;
  const year = deadline?.getUTCFullYear() ?? now.getUTCFullYear();
  const month = deadline ? deadline.getUTCMonth() + 1 : now.getUTCMonth() + 1;
  const background = spec.background?.trim() ?? "";

  const enrichAnswersJson =
    spec.enrichAnswers && spec.enrichAnswers.length > 0
      ? (spec.enrichAnswers as Prisma.InputJsonValue)
      : undefined;

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: spec.title,
      description: "",
      background: background || null,
      enrichAnswers: enrichAnswersJson,
      iconName: null,
      lifeArea,
      goalType: "project",
      categoryId,
      themeId: spec.themeId,
      deadline,
      timelineStart,
      completedAt,
      significance: spec.significance,
      status: spec.status,
      aiGenerated: false,
      parentGoalId: null,
      future: deadline ? deadline.getTime() > now.getTime() : true,
      year,
      month,
      sequencePosition,
      mapGridQ: spec.mapGridQ,
      mapGridR: spec.mapGridR,
      ...(spec.targetAmount != null ? { targetAmount: spec.targetAmount } : {}),
      ...(spec.currentAmount != null ? { currentAmount: spec.currentAmount } : {}),
      ...(spec.unit ? { unit: spec.unit } : {}),
      ...(spec.amountBasis ? { amountBasis: spec.amountBasis } : {}),
    },
  });

  for (let i = 0; i < (spec.milestones ?? []).length; i++) {
    const m = spec.milestones![i]!;
    let milestoneCompletedAt: Date | null = null;
    if (m.completed) {
      if (m.completedOn != null) {
        milestoneCompletedAt = parseUtcDate(m.completedOn);
      } else if (m.completedDaysAgo != null) {
        milestoneCompletedAt = daysAgo(m.completedDaysAgo);
      }
    }
    await prisma.milestone.create({
      data: {
        goalId: goal.id,
        title: m.title,
        description: "",
        position: i,
        completedAt: milestoneCompletedAt,
      },
    });
  }

  return goal.id;
}

async function insertOrientation(
  prisma: PrismaClient,
  userId: string,
  orientation: string,
): Promise<void> {
  await prisma.profileFact.create({
    data: {
      userId,
      category: "preferences",
      key: ORIENTATION_FACT_KEY,
      value: orientation,
      source: "user_manual",
    },
  });
}

async function insertRelationships(
  prisma: PrismaClient,
  userId: string,
  titleToId: Map<string, string>,
  relationships: readonly RelationshipSpec[],
): Promise<void> {
  for (const rel of relationships) {
    const idA = titleToId.get(rel.titleA);
    const idB = titleToId.get(rel.titleB);
    if (!idA || !idB) {
      throw new Error(`Relationship titles not found: ${rel.titleA} ↔ ${rel.titleB}`);
    }
    const [goalAId, goalBId] = normalizeRelationshipPair(idA, idB);
    await prisma.pursuitRelationship.create({
      data: {
        userId,
        goalAId,
        goalBId,
        kind: "related",
        label: rel.label ?? null,
      },
    });
  }
}

export async function seedQaProfile(
  prisma: PrismaClient,
  passwordHash: string,
  profile: QaProfileConfig,
): Promise<{ userId: string; countsByTheme: Map<string, number>; pursuitCount: number }> {
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.displayName,
      passwordHash,
      birthYear: new Date().getUTCFullYear() - profile.age,
      birthPlace: profile.location,
      onboardingCompleted: true,
      unlockedLimbIds: [],
    },
  });

  await ensureTaxonomyCurrent(prisma, user.id);
  await unlockThemesForUser(prisma, user.id, profile.unlockThemes);
  await activateLimbsForUser(prisma, user.id, profile.unlockThemes);

  await prisma.userManualProfile.create({
    data: {
      userId: user.id,
      displayName: profile.displayName,
      dateOfBirth: dateOfBirthForAge(profile.age),
      location: profile.location,
      educationLevel: profile.educationLevel ?? null,
      employmentStatus: profile.employmentStatus ?? null,
      industry: profile.industry ?? null,
      jobTitle: profile.jobTitle ?? null,
      occupation: profile.jobTitle ?? null,
    },
  });

  if (profile.orientation?.trim()) {
    await insertOrientation(prisma, user.id, profile.orientation.trim());
  }

  const countsByTheme = new Map<string, number>();
  const titleToId = new Map<string, string>();
  const sequenceByCategory = new Map<string, number>();
  const activatedCategories = new Set<string>();

  for (const spec of profile.pursuits) {
    const categoryId = await findSystemCategory(
      prisma,
      user.id,
      spec.themeId,
      spec.categoryLabel,
    );
    if (!activatedCategories.has(categoryId)) {
      await activateCategoryForUser(prisma, user.id, categoryId);
      activatedCategories.add(categoryId);
    }

    const seq = sequenceByCategory.get(categoryId) ?? 0;
    sequenceByCategory.set(categoryId, seq + 1);

    const goalId = await insertPursuit(prisma, user.id, spec, categoryId, seq);
    titleToId.set(spec.title, goalId);

    const label = themeLabel(spec.themeId);
    countsByTheme.set(label, (countsByTheme.get(label) ?? 0) + 1);
  }

  if (profile.relationships?.length) {
    await insertRelationships(prisma, user.id, titleToId, profile.relationships);
  }

  if (profile.markReadingDirty) {
    await markGlobalReadingDirty(user.id, "qa_seed");
    for (const goalId of titleToId.values()) {
      await markPursuitReadingDirty(user.id, goalId, "qa_seed");
    }
  }

  return { userId: user.id, countsByTheme, pursuitCount: profile.pursuits.length };
}

export function themeLabel(themeId: LifeAreaId): string {
  return getLifeArea(themeId)?.label ?? themeId;
}
