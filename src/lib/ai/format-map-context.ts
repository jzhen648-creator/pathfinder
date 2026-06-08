import { getLifeArea } from "@/lib/life-areas";

import { canonicalRootHubRows } from "@/lib/hub-dedupe";

import { prisma } from "@/lib/prisma";



type MapContextFilter = {

  themeId?: string;

  hubId?: string;

  pursuitId?: string;

  /** Omit ON_HOLD pursuits — use for insight generation only; Stream needs paused rows for dedup/resume. */

  excludeOnHold?: boolean;

};



export type FormattedMapMark = {

  id: string;

  title: string;

  description: string;

  /** ISO calendar date (YYYY-MM-DD) when known; omitted from JSON when absent. */

  date?: string;

  sentiment: string;

};



export type FormattedMapContext = {

  themes: Array<{

    id: string;

    label: string;

    marks: FormattedMapMark[];

    hubs: Array<{

      id: string;

      label: string;

      pursuits: Array<{

        id: string;

        title: string;

        description: string;

        status: string;

        milestones: Array<{

          id: string;

          title: string;

          completed: boolean;

        }>;

        /** Present when user nested this pursuit under another via edit map. */

        parentPursuitTitle?: string;

      }>;

    }>;

  }>;

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



export async function formatMapContext(

  userId: string,

  filter: MapContextFilter = {},

): Promise<FormattedMapContext> {

  const branches = canonicalRootHubRows(

    await prisma.branch.findMany({

    where: {

      userId,

      parentBranchId: null,

      ...(filter.themeId ? { limbId: filter.themeId } : {}),

      ...(filter.hubId ? { id: filter.hubId } : {}),

      isActive: true,

    },

    select: {

      id: true,

      limbId: true,

      label: true,

      name: true,

      isSystemHub: true,

      createdAt: true,

      goals: {

        where: {

          archived: false,

          goalType: { notIn: ["moment", "event"] },

          ...(filter.excludeOnHold ? { bloomStatus: { not: "ON_HOLD" } } : {}),

          ...(filter.pursuitId ? { id: filter.pursuitId } : {}),

        },

        select: {

          id: true,

          title: true,

          description: true,

          bloomStatus: true,

          parentGoalId: true,

          milestones: {

            select: {

              id: true,

              title: true,

              completedAt: true,

            },

            orderBy: { position: "asc" },

          },

        },

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

    orderBy: [{ limbId: "asc" }, { order: "asc" }, { createdAt: "asc" }],

  }),

  );



  const themeMap = new Map<string, FormattedMapContext["themes"][number]>();



  for (const branch of branches) {

    const theme =

      themeMap.get(branch.limbId) ??

      {

        id: branch.limbId,

        label: getLifeArea(branch.limbId)?.label ?? branch.limbId,

        marks: [],

        hubs: [],

      };



    const seenMarkIds = new Set(theme.marks.map((mark) => mark.id));

    for (const mark of branch.marks) {

      if (seenMarkIds.has(mark.id)) continue;

      seenMarkIds.add(mark.id);

      theme.marks.push(serializeMarkRow(mark));

    }



    const pursuitTitleById = new Map(branch.goals.map((goal) => [goal.id, goal.title]));



    theme.hubs.push({

      id: branch.id,

      label: branch.label ?? branch.name ?? branch.id,

      pursuits: branch.goals.map((goal) => {

        const pursuit: FormattedMapContext["themes"][number]["hubs"][number]["pursuits"][number] = {

          id: goal.id,

          title: goal.title,

          description: goal.description?.trim() ?? "",

          status: goal.bloomStatus,

          milestones: goal.milestones.map((milestone) => ({

            id: milestone.id,

            title: milestone.title,

            completed: Boolean(milestone.completedAt),

          })),

        };



        if (goal.parentGoalId) {

          const parentTitle = pursuitTitleById.get(goal.parentGoalId);

          if (parentTitle) {

            pursuit.parentPursuitTitle = parentTitle;

          }

        }



        return pursuit;

      }),

    });



    themeMap.set(branch.limbId, theme);

  }



  return { themes: [...themeMap.values()] };

}


