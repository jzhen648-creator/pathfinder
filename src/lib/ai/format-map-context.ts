import type { PursuitStatus } from "@prisma/client";
import { canonicalCategoryDisplayLabel } from "@/lib/category-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { canonicalRootHubRows } from "@/lib/category-dedupe";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

export const MAX_MILESTONE_DESCRIPTION_CHARS = 200;

export type MapContextFilter = {
  themeId?: string;
  hubId?: string;
  pursuitId?: string;
  /** Omit paused pursuits — e.g. Story scope. */
  excludePaused?: boolean;
  /** @deprecated Use excludePaused */
  excludeOnHold?: boolean;
};

export type FormattedMapMark = {
  id: string;
  title: string;
  description: string;
  /** ISO calendar date (YYYY-MM-DD) when known; omitted from JSON when absent. */
  date?: string;
  sentiment: string;
  /** When true, treat as upcoming even if date is in the past. */
  future?: boolean;
};

export type FormattedMapPursuit = {
  id: string;
  title: string;
  description: string;
  /** Structured quick-question answers — authoritative QQ store for AI context. */
  enrichAnswers?: Array<{
    clarifierId: string;
    prompt: string;
    selectedOption: string;
  }>;
  status: string;
  /** 1–5; higher = more weight on the map. */
  significance: number;
  milestones: Array<{
    id: string;
    title: string;
    completed: boolean;
    /** ISO calendar date when milestone was completed. */
    completedAt?: string;
    /** Optional detail — what this milestone entails. */
    description?: string;
  }>;
  /** Present when user nested this pursuit under another via edit map. */
  parentPursuitTitle?: string;
  targetAmount?: number;
  currentAmount?: number;
  unit?: string;
  deadline?: string;
  /** ISO calendar date when pursuit was marked complete. */
  completedAt?: string;
  /** ISO calendar date when pursuit span begins (optional). */
  timelineStart?: string;
};

export type FormattedMapContext = {
  themes: Array<{
    id: string;
    label: string;
    marks: FormattedMapMark[];
    hubs: Array<{
      id: string;
      label: string;
      section: string;
      marks: FormattedMapMark[];
      pursuits: FormattedMapPursuit[];
    }>;
  }>;
  /** User-confirmed lateral pursuit relationships (titles + optional label). */
  confirmedRelationships?: Array<{
    goalAId: string;
    goalBId: string;
    goalATitle: string;
    goalBTitle: string;
    label?: string | null;
  }>;
};

export type FormattedPursuitContext = {
  pursuit: FormattedMapPursuit & {
    themeId: string;
    themeLabel: string;
    hubId: string;
    section: string;
  };
  siblingPursuits: Array<{
    id: string;
    title: string;
    status: string;
    section: string;
  }>;
  siblingMarks: FormattedMapMark[];
};

export function serializeEnrichAnswersForMapContext(
  raw: unknown,
): FormattedMapPursuit["enrichAnswers"] | undefined {
  const parsed = enrichAnswersSchema.safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) return undefined;
  return parsed.data;
}

function trimMilestoneDescription(description: string | null | undefined): string | undefined {
  const trimmed = description?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_MILESTONE_DESCRIPTION_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MILESTONE_DESCRIPTION_CHARS).trim()}…`;
}

/** @internal Exported for vitest — AI map_context pursuit row shape. */
export function buildPursuitRow(
  goal: {
    id: string;
    title: string;
    description: string | null;
    enrichAnswers?: unknown;
    status: string;
    significance: number | null;
    parentGoalId: string | null;
    targetAmount: number | null;
    currentAmount: number | null;
    unit: string | null;
    deadline: Date | null;
    completedAt?: Date | null;
    timelineStart?: Date | null;
    milestones: Array<{ id: string; title: string; completedAt: Date | null; description?: string | null }>;
  },
  pursuitTitleById: Map<string, string>,
): FormattedMapPursuit {
  const pursuit: FormattedMapPursuit = {
    id: goal.id,
    title: goal.title,
    description: goal.description?.trim() ?? "",
    status: goal.status,
    significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
    milestones: goal.milestones.map((milestone) => {
      const row: FormattedMapPursuit["milestones"][number] = {
        id: milestone.id,
        title: milestone.title,
        completed: Boolean(milestone.completedAt),
      };
      if (milestone.completedAt) {
        row.completedAt = milestone.completedAt.toISOString().slice(0, 10);
      }
      const description = trimMilestoneDescription(milestone.description);
      if (description) row.description = description;
      return row;
    }),
  };

  if (goal.parentGoalId) {
    const parentTitle = pursuitTitleById.get(goal.parentGoalId);
    if (parentTitle) pursuit.parentPursuitTitle = parentTitle;
  }
  if (goal.targetAmount != null) pursuit.targetAmount = goal.targetAmount;
  if (goal.currentAmount != null) pursuit.currentAmount = goal.currentAmount;
  if (goal.unit?.trim()) pursuit.unit = goal.unit.trim();
  if (goal.deadline) pursuit.deadline = goal.deadline.toISOString().slice(0, 10);
  if (goal.completedAt) pursuit.completedAt = goal.completedAt.toISOString().slice(0, 10);
  if (goal.timelineStart) pursuit.timelineStart = goal.timelineStart.toISOString().slice(0, 10);

  const enrichAnswers = serializeEnrichAnswersForMapContext(goal.enrichAnswers);
  if (enrichAnswers) pursuit.enrichAnswers = enrichAnswers;

  return pursuit;
}

function pursuitStatusWhere(filter: MapContextFilter) {
  const excludePaused = filter.excludePaused ?? filter.excludeOnHold ?? false;
  if (!excludePaused) return {};
  return { status: { notIn: ["PAUSED"] satisfies PursuitStatus[] } };
}

const goalSelect = {
  id: true,
  title: true,
  description: true,
  enrichAnswers: true,
  status: true,
  significance: true,
  parentGoalId: true,
  targetAmount: true,
  currentAmount: true,
  unit: true,
  deadline: true,
  completedAt: true,
  timelineStart: true,
  milestones: {
    select: {
      id: true,
      title: true,
      completedAt: true,
      description: true,
    },
    orderBy: { position: "asc" as const },
  },
};

export async function formatMapContext(
  userId: string,
  filter: MapContextFilter = {},
): Promise<FormattedMapContext> {
  const branches = canonicalRootHubRows(
    await prisma.themeCategory.findMany({
      where: {
        userId,
        parentCategoryId: null,
        ...(filter.themeId ? { themeId: filter.themeId } : {}),
        ...(filter.hubId ? { id: filter.hubId } : {}),
        isActive: true,
      },
      select: {
        id: true,
        themeId: true,
        label: true,
        name: true,
        isSystemCategory: true,
        createdAt: true,
        goals: {
          where: {
            archived: false,
            goalType: { notIn: ["moment", "event"] },
            ...pursuitStatusWhere(filter),
            ...(filter.pursuitId ? { id: filter.pursuitId } : {}),
          },
          select: goalSelect,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ themeId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    }),
  );

  const themeMap = new Map<string, FormattedMapContext["themes"][number]>();

  for (const branch of branches) {
    const theme =
      themeMap.get(branch.themeId) ??
      {
        id: branch.themeId,
        label: getLifeArea(branch.themeId)?.label ?? branch.themeId,
        marks: [],
        hubs: [],
      };

    const hubRawLabel = branch.label ?? branch.name ?? branch.id;
    const section = canonicalCategoryDisplayLabel(branch.themeId, hubRawLabel);
    const pursuitTitleById = new Map(branch.goals.map((goal) => [goal.id, goal.title]));

    theme.hubs.push({
      id: branch.id,
      label: hubRawLabel,
      section,
      marks: [],
      pursuits: branch.goals.map((goal) => buildPursuitRow(goal, pursuitTitleById)),
    });

    themeMap.set(branch.themeId, theme);
  }

  const relationships = await prisma.pursuitRelationship.findMany({
    where: { userId },
    select: {
      goalAId: true,
      goalBId: true,
      label: true,
      goalA: { select: { title: true } },
      goalB: { select: { title: true } },
    },
  });

  const confirmedRelationships = relationships.map((row) => ({
    goalAId: row.goalAId,
    goalBId: row.goalBId,
    goalATitle: row.goalA.title,
    goalBTitle: row.goalB.title,
    label: row.label?.trim() || null,
  }));

  return { themes: [...themeMap.values()], confirmedRelationships };
}

/** Full layered context for a single pursuit — context questions, milestones, enrich. */
export async function formatPursuitContext(
  userId: string,
  pursuitId: string,
): Promise<FormattedPursuitContext | null> {
  const goal = await prisma.goal.findFirst({
    where: {
      id: pursuitId,
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      ...goalSelect,
      categoryId: true,
      themeId: true,
      themeCategory: { select: { id: true, label: true, name: true, themeId: true } },
    },
  });
  if (!goal?.categoryId) return null;

  const themeId = goal.themeId ?? goal.themeCategory?.themeId ?? "becoming";
  const themeLabel = getLifeArea(themeId)?.label ?? themeId;
  const hubRawLabel = goal.themeCategory?.label ?? goal.themeCategory?.name ?? goal.categoryId;
  const section = canonicalCategoryDisplayLabel(themeId, hubRawLabel);

  const siblingGoals = await prisma.goal.findMany({
    where: {
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
      themeId: themeId,
      id: { not: pursuitId },
    },
    select: {
      id: true,
      title: true,
      status: true,
      themeCategory: { select: { label: true, name: true, themeId: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  const pursuitTitleById = new Map([[goal.id, goal.title]]);

  return {
    pursuit: {
      ...buildPursuitRow(goal, pursuitTitleById),
      themeId,
      themeLabel,
      hubId: goal.categoryId,
      section,
    },
    siblingPursuits: siblingGoals.map((sibling) => ({
      id: sibling.id,
      title: sibling.title,
      status: sibling.status,
      section: canonicalCategoryDisplayLabel(
        themeId,
        sibling.themeCategory?.label ?? sibling.themeCategory?.name ?? "",
      ),
    })),
    siblingMarks: [],
  };
}
