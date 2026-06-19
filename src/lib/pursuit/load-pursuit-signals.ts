import { pursuitSignalFromGoal, type PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import { prisma } from "@/lib/prisma";

const pursuitSignalSelect = {
  id: true,
  title: true,
  description: true,
  enrichAnswers: true,
  deadline: true,
  status: true,
  targetAmount: true,
  milestones: { select: { completedAt: true } },
  themeId: true,
  lifeArea: true,
} as const;

/** All non-archived pursuit signals on the user's map. */
export async function loadAllPursuitSignals(userId: string): Promise<PursuitSignal[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: pursuitSignalSelect,
  });
  return goals.map((goal) => pursuitSignalFromGoal(goal));
}

/** Pursuit signals grouped by theme id (includes legacy lifeArea fallback). */
export async function loadPursuitSignalsByTheme(
  userId: string,
  themeIds: string[],
): Promise<Map<string, PursuitSignal[]>> {
  if (themeIds.length === 0) return new Map();

  const goals = await prisma.goal.findMany({
    where: {
      userId,
      archived: false,
      OR: [
        { themeId: { in: themeIds } },
        { themeId: null, lifeArea: { in: themeIds } },
      ],
    },
    select: pursuitSignalSelect,
  });

  const byTheme = new Map<string, PursuitSignal[]>();
  for (const goal of goals) {
    const themeId = goal.themeId ?? goal.lifeArea;
    const list = byTheme.get(themeId) ?? [];
    list.push(pursuitSignalFromGoal(goal));
    byTheme.set(themeId, list);
  }
  return byTheme;
}
