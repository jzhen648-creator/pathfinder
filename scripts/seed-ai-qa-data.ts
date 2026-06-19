import type { PrismaClient, PursuitStatus } from "@prisma/client";
import type { LifeAreaId } from "../src/lib/types";
import { getLifeArea } from "../src/lib/life-areas";
import { systemCategoryKey } from "../src/lib/system-categories";

export const SEED_EMAILS = ["alex@qa-seed.test", "sam@qa-seed.test"] as const;

export type MilestoneSpec = {
  title: string;
  completed: boolean;
  completedDaysAgo?: number;
  /** Fixed completion date (YYYY-MM-DD). Takes precedence over completedDaysAgo. */
  completedOn?: string;
};

export type PursuitSpec = {
  title: string;
  themeId: LifeAreaId;
  categoryLabel: string;
  status: PursuitStatus;
  significance: number;
  description?: string;
  deadlineDaysFromNow?: number;
  /** Fixed deadline (YYYY-MM-DD). Takes precedence over deadlineDaysFromNow. */
  deadlineOn?: string;
  completedDaysAgo?: number;
  /** Fixed completion date for COMPLETE pursuits (YYYY-MM-DD). */
  completedOn?: string;
  targetAmount?: number;
  currentAmount?: number;
  unit?: string;
  mapGridQ: number;
  mapGridR: number;
  milestones?: MilestoneSpec[];
};

export function parseUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export const ALEX_PROFILE = {
  email: "alex@qa-seed.test",
  displayName: "Alex Carter",
  age: 31,
  location: "United Kingdom",
  educationLevel: "higher",
  employmentStatus: "EMPLOYED",
  industry: "Finance",
  jobTitle: "Mortgage Advisor",
  /** Themes with pursuits — pleasures stays empty for Distribution lens. */
  unlockThemes: [
    "work",
    "finance",
    "people",
    "becoming",
    "health",
    "pleasures",
  ] as LifeAreaId[],
  pursuits: [
    // Imported from alex-reseed-pursuits.ts — see scripts/reseed-alex-qa.ts
  ],
} as const;

export const SAM_PROFILE = {
  email: "sam@qa-seed.test",
  displayName: "Sam Chen",
  age: 27,
  location: "United Kingdom",
  educationLevel: "secondary",
  employmentStatus: "STUDENT",
  unlockThemes: ["work"] as LifeAreaId[],
  pursuits: [
    {
      title: "CeMAP qualification",
      themeId: "work",
      categoryLabel: "Job",
      status: "ACTIVE",
      significance: 3,
      description: "First regulated finance qualification — early research phase only.",
      deadlineDaysFromNow: 90,
      mapGridQ: 1,
      mapGridR: 0,
    },
  ] satisfies PursuitSpec[],
} as const;

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
    where: { userId, parentCategoryId: null, themeId },
    select: { id: true, label: true, name: true },
  });
  const match = rows.find((r) => systemCategoryKey(themeId, r.label ?? r.name) === key);
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
  const year = deadline?.getUTCFullYear() ?? now.getUTCFullYear();
  const month = deadline ? deadline.getUTCMonth() + 1 : now.getUTCMonth() + 1;

  const goal = await prisma.goal.create({
    data: {
      userId,
      title: spec.title,
      description: spec.description ?? "",
      iconName: null,
      lifeArea,
      goalType: "project",
      categoryId,
      themeId: spec.themeId,
      deadline,
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
    },
  });

  const milestones = spec.milestones ?? [];
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]!;
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

export function themeLabel(themeId: LifeAreaId): string {
  return getLifeArea(themeId)?.label ?? themeId;
}
