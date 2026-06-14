import type { PrismaClient, PursuitStatus } from "@prisma/client";
import type { LifeAreaId } from "../src/lib/types";
import { getLifeArea } from "../src/lib/life-areas";
import { systemCategoryKey } from "../src/lib/system-categories";

export const SEED_EMAILS = ["alex@qa-seed.test", "sam@qa-seed.test"] as const;

export type MilestoneSpec = {
  title: string;
  completed: boolean;
  completedDaysAgo?: number;
};

export type PursuitSpec = {
  title: string;
  themeId: LifeAreaId;
  categoryLabel: string;
  status: PursuitStatus;
  significance: number;
  description?: string;
  deadlineDaysFromNow?: number;
  completedDaysAgo?: number;
  mapGridQ: number;
  mapGridR: number;
  milestones?: MilestoneSpec[];
};

export const ALEX_PROFILE = {
  email: "alex@qa-seed.test",
  displayName: "Alex Carter",
  age: 31,
  location: "United Kingdom",
  educationLevel: "higher",
  employmentStatus: "EMPLOYED",
  industry: "Finance",
  jobTitle: "Senior Engineer",
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
    // Work — heavy (6)
    {
      title: "CeMAP qualification",
      themeId: "work",
      categoryLabel: "Job",
      status: "ACTIVE",
      significance: 5,
      description:
        "Studying for CeMAP through the London Institute of Banking & Finance. Units 1–2 are underway; the exam window is in three weeks. This unlocks regulated mortgage advice work.",
      deadlineDaysFromNow: 18,
      mapGridQ: 1,
      mapGridR: 0,
      milestones: [
        { title: "Unit 1 coursework", completed: false },
        { title: "Unit 2 coursework", completed: false },
        { title: "Mock exam", completed: false },
      ],
    },
    {
      title: "Product Lead search",
      themeId: "work",
      categoryLabel: "Job",
      status: "ACTIVE",
      significance: 5,
      description:
        "Targeting product leadership roles in fintech after the Acme senior engineer chapter. Two processes are live; need sharper narrative on platform ownership.",
      deadlineDaysFromNow: 75,
      mapGridQ: 2,
      mapGridR: 0,
      milestones: [{ title: "First-round interview", completed: true, completedDaysAgo: 40 }],
    },
    {
      title: "Senior Engineer at Acme",
      themeId: "work",
      categoryLabel: "Job",
      status: "COMPLETE",
      significance: 4,
      completedDaysAgo: 120,
      mapGridQ: -1,
      mapGridR: 1,
      milestones: [{ title: "Handover complete", completed: true, completedDaysAgo: 125 }],
    },
    {
      title: "Passed probation at Acme",
      themeId: "work",
      categoryLabel: "Job",
      status: "COMPLETE",
      significance: 3,
      description: "Six-month probation cleared with strong delivery on payments reliability.",
      completedDaysAgo: 200,
      mapGridQ: 0,
      mapGridR: 2,
    },
    {
      title: "Public speaking",
      themeId: "work",
      categoryLabel: "Skills & learning",
      status: "MAINTAINING",
      significance: 3,
      mapGridQ: 1,
      mapGridR: 1,
      milestones: [{ title: "Toastmasters icebreaker", completed: true, completedDaysAgo: 90 }],
    },
    {
      title: "Ship Q3 internal tool",
      themeId: "work",
      categoryLabel: "Projects & shipping",
      status: "ACTIVE",
      significance: 4,
      description:
        "Leading a small squad shipping an internal compliance dashboard before the September audit. Design is signed off; build is mid-sprint.",
      deadlineDaysFromNow: 45,
      mapGridQ: -1,
      mapGridR: 0,
      milestones: [
        { title: "Design review", completed: true, completedDaysAgo: 14 },
        { title: "Beta to compliance", completed: false },
      ],
    },
    // Finance (3)
    {
      title: "£500,000 ISA",
      themeId: "finance",
      categoryLabel: "Assets & investing",
      status: "ACTIVE",
      significance: 5,
      description:
        "Long-term Stocks and Shares ISA target for financial independence. Contributing monthly; roughly a quarter of the way there after last year's raise.",
      deadlineDaysFromNow: 900,
      mapGridQ: 1,
      mapGridR: 0,
    },
    {
      title: "Clear £10,000 credit card debt",
      themeId: "finance",
      categoryLabel: "Debts & obligations",
      status: "ACTIVE",
      significance: 4,
      description:
        "Balance is down from £10k but still above comfort. Want it cleared before the wedding spend ramps up.",
      deadlineDaysFromNow: 28,
      mapGridQ: 2,
      mapGridR: 0,
    },
    {
      title: "Emergency fund £3,000",
      themeId: "finance",
      categoryLabel: "Safety net",
      status: "COMPLETE",
      significance: 3,
      completedDaysAgo: 95,
      mapGridQ: -1,
      mapGridR: 1,
    },
    // People (2)
    {
      title: "Plan wedding",
      themeId: "people",
      categoryLabel: "Family",
      status: "ACTIVE",
      significance: 5,
      description:
        "Venue shortlist down to two; need to lock caterer and guest list by autumn. Partner wants something small in London or Kent.",
      deadlineDaysFromNow: 120,
      mapGridQ: 1,
      mapGridR: 0,
    },
    {
      title: "Visit parents monthly",
      themeId: "people",
      categoryLabel: "Family",
      status: "MAINTAINING",
      significance: 2,
      mapGridQ: 0,
      mapGridR: 1,
    },
    // Becoming (2)
    {
      title: "Daily meditation",
      themeId: "becoming",
      categoryLabel: "Mind & Emotions",
      status: "MAINTAINING",
      significance: 3,
      mapGridQ: 1,
      mapGridR: 0,
    },
    {
      title: "Evening journaling",
      themeId: "becoming",
      categoryLabel: "Mind & Emotions",
      status: "ACTIVE",
      significance: 2,
      description: "Ten minutes before bed — tracking mood and what actually moved the day forward.",
      deadlineDaysFromNow: 180,
      mapGridQ: -1,
      mapGridR: 1,
    },
    // Health — thin, paused (1)
    {
      title: "London Marathon 2027",
      themeId: "health",
      categoryLabel: "Movement",
      status: "PAUSED",
      significance: 4,
      mapGridQ: 1,
      mapGridR: 0,
      milestones: [{ title: "Half marathon PB", completed: false }],
    },
    // Finance rhythm (15th pursuit)
    {
      title: "Monthly budget review",
      themeId: "finance",
      categoryLabel: "Employment income",
      status: "MAINTAINING",
      significance: 2,
      mapGridQ: 0,
      mapGridR: 1,
    },
  ] satisfies PursuitSpec[],
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
  const deadline =
    spec.deadlineDaysFromNow != null ? daysFromNow(spec.deadlineDaysFromNow) : null;
  const completedAt =
    spec.completedDaysAgo != null ? daysAgo(spec.completedDaysAgo) : null;
  const now = new Date();
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
    },
  });

  const milestones = spec.milestones ?? [];
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]!;
    await prisma.milestone.create({
      data: {
        goalId: goal.id,
        title: m.title,
        description: "",
        position: i,
        completedAt:
          m.completed && m.completedDaysAgo != null ? daysAgo(m.completedDaysAgo) : null,
      },
    });
  }

  return goal.id;
}

export function themeLabel(themeId: LifeAreaId): string {
  return getLifeArea(themeId)?.label ?? themeId;
}
