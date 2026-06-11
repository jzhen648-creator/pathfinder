import type { BloomStatus } from "@prisma/client";
import { canonicalHubDisplayLabel } from "@/lib/category-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { canonicalRootHubRows } from "@/lib/category-dedupe";
import { prisma } from "@/lib/prisma";

export type MapContextFilter = {
  themeId?: string;
  hubId?: string;
  pursuitId?: string;
  /** Omit paused pursuits — e.g. Story scope. */
  excludePaused?: boolean;
  /** @deprecated Use excludePaused */
  excludeOnHold?: boolean;
  /** Omit abandoned pursuits from map-oriented AI context. */
  excludeAbandoned?: boolean;
};

export type FormattedMapMark = {
  id: string;
  title: string;
  description: string;
  /** ISO calendar date (YYYY-MM-DD) when known; omitted from JSON when absent. */
  date?: string;
  sentiment: string;
};

export type FormattedMapPursuit = {
  id: string;
  title: string;
  description: string;
  status: string;
  /** 1–5; higher = more weight on the map. */
  significance: number;
  milestones: Array<{
    id: string;
    title: string;
    completed: boolean;
  }>;
  iconName?: string;
  shortLabel?: string;
  /** Present when user nested this pursuit under another via edit map. */
  parentPursuitTitle?: string;
  targetAmount?: number;
  currentAmount?: number;
  unit?: string;
  deadline?: string;
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

function serializeMarkRow(mark: {
  id: string;
  title: string;
  description: string | null;
  date: Date | null;
  sentiment: string;
}): FormattedMapMark {
  const row: FormattedMapMark = {
    id: mark.id,
    title: mark.title,
    description: mark.description?.trim() ?? "",
    sentiment: mark.sentiment,
  };
  if (mark.date) {
    row.date = mark.date.toISOString().slice(0, 10);
  }
  return row;
}

function buildPursuitRow(
  goal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    significance: number | null;
    parentGoalId: string | null;
    targetAmount: number | null;
    currentAmount: number | null;
    unit: string | null;
    deadline: Date | null;
    iconName: string | null;
    shortLabel: string | null;
    milestones: Array<{ id: string; title: string; completedAt: Date | null }>;
  },
  pursuitTitleById: Map<string, string>,
): FormattedMapPursuit {
  const pursuit: FormattedMapPursuit = {
    id: goal.id,
    title: goal.title,
    description: goal.description?.trim() ?? "",
    status: goal.status,
    significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
    milestones: goal.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      completed: Boolean(milestone.completedAt),
    })),
  };

  if (goal.parentGoalId) {
    const parentTitle = pursuitTitleById.get(goal.parentGoalId);
    if (parentTitle) pursuit.parentPursuitTitle = parentTitle;
  }
  if (goal.targetAmount != null) pursuit.targetAmount = goal.targetAmount;
  if (goal.currentAmount != null) pursuit.currentAmount = goal.currentAmount;
  if (goal.unit?.trim()) pursuit.unit = goal.unit.trim();
  if (goal.deadline) pursuit.deadline = goal.deadline.toISOString().slice(0, 10);
  if (goal.iconName?.trim()) pursuit.iconName = goal.iconName.trim();
  if (goal.shortLabel?.trim()) pursuit.shortLabel = goal.shortLabel.trim();

  return pursuit;
}

function pursuitStatusWhere(filter: MapContextFilter) {
  const excludePaused = filter.excludePaused ?? filter.excludeOnHold ?? false;
  const excludeAbandoned = filter.excludeAbandoned ?? false;
  const notIn: BloomStatus[] = [];
  if (excludePaused) notIn.push("PAUSED");
  if (excludeAbandoned) notIn.push("ABANDONED");
  if (notIn.length === 0) return {};
  return { status: { notIn } };
}

const goalSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  significance: true,
  parentGoalId: true,
  targetAmount: true,
  currentAmount: true,
  unit: true,
  deadline: true,
  iconName: true,
  shortLabel: true,
  milestones: {
    select: {
      id: true,
      title: true,
      completedAt: true,
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
        marks: {
          where: { archived: false },
          select: {
            id: true,
            title: true,
            description: true,
            date: true,
            sentiment: true,
            sequencePosition: true,
          },
          orderBy: [{ sequencePosition: "asc" }, { date: "asc" }, { createdAt: "asc" }],
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

    const seenMarkIds = new Set(theme.marks.map((mark) => mark.id));
    for (const mark of branch.marks) {
      if (seenMarkIds.has(mark.id)) continue;
      seenMarkIds.add(mark.id);
      theme.marks.push(serializeMarkRow(mark));
    }

    const hubRawLabel = branch.label ?? branch.name ?? branch.id;
    const section = canonicalHubDisplayLabel(branch.themeId, hubRawLabel);
    const pursuitTitleById = new Map(branch.goals.map((goal) => [goal.id, goal.title]));

    theme.hubs.push({
      id: branch.id,
      label: hubRawLabel,
      section,
      marks: branch.marks.map((mark) => serializeMarkRow(mark)),
      pursuits: branch.goals.map((goal) => buildPursuitRow(goal, pursuitTitleById)),
    });

    themeMap.set(branch.themeId, theme);
  }

  return { themes: [...themeMap.values()] };
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
  const section = canonicalHubDisplayLabel(themeId, hubRawLabel);

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

  const hubMarks = await prisma.mark.findMany({
    where: { userId, categoryId: goal.categoryId, archived: false },
    select: { id: true, title: true, description: true, date: true, sentiment: true },
    orderBy: [{ sequencePosition: "asc" }, { date: "asc" }],
    take: 20,
  });

  const themeMarks = await prisma.mark.findMany({
    where: { userId, themeId: themeId, archived: false },
    select: { id: true, title: true, description: true, date: true, sentiment: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 15,
  });

  const markById = new Map<string, FormattedMapMark>();
  for (const mark of [...hubMarks, ...themeMarks]) {
    markById.set(mark.id, serializeMarkRow(mark));
  }

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
      section: canonicalHubDisplayLabel(
        themeId,
        sibling.themeCategory?.label ?? sibling.themeCategory?.name ?? "",
      ),
    })),
    siblingMarks: [...markById.values()],
  };
}
