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

export type FormattedMapContext = {
  themes: Array<{
    id: string;
    label: string;
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
        markCount: number;
      }>;
    }>;
  }>;
};

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
        select: { id: true },
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
        hubs: [],
      };

    theme.hubs.push({
      id: branch.id,
      label: branch.label ?? branch.name ?? branch.id,
      pursuits: branch.goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description?.trim() ?? "",
        status: goal.bloomStatus,
        milestones: goal.milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          completed: Boolean(milestone.completedAt),
        })),
        markCount: branch.marks.length,
      })),
    });

    themeMap.set(branch.limbId, theme);
  }

  return { themes: [...themeMap.values()] };
}
