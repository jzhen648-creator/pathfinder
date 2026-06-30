import { prisma } from "@/lib/prisma";

import type { PursuitToneGoalInput } from "@/lib/insights/resolve-pursuit-insight-tone";

export async function loadPursuitToneGoals(
  userId: string,
  pursuitIds: string[],
): Promise<Map<string, PursuitToneGoalInput & { id: string; themeId?: string | null }>> {
  if (pursuitIds.length === 0) return new Map();

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      background: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      themeId: true,
      significance: true,
      targetAmount: true,
      currentAmount: true,
      completedAt: true,
      milestones: {
        select: { id: true, title: true, completedAt: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return new Map(goals.map((goal) => [goal.id, goal]));
}
