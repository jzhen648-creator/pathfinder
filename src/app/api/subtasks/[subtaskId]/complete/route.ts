import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoalWithProgress, getUserLevelData } from "@/lib/roadmap";

type RouteProps = {
  params: Promise<{
    subtaskId: string;
  }>;
};

export async function PATCH(_request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subtaskId } = await params;

  const subtask = await prisma.subtask.findUnique({
    where: { id: subtaskId },
    include: {
      milestone: {
        include: {
          goal: true,
        },
      },
    },
  });

  if (!subtask || subtask.milestone.goal.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const willComplete = !subtask.isCompleted;
  const xpDelta = willComplete ? subtask.xpReward : -subtask.xpReward;

  await prisma.$transaction([
    prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        isCompleted: willComplete,
        completedAt: willComplete ? new Date() : null,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        xp: {
          [willComplete ? "increment" : "decrement"]: subtask.xpReward,
        },
      },
    }),
  ]);

  const goal = await getGoalWithProgress(subtask.milestone.goalId, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });

  return NextResponse.json({
    xpAwarded: xpDelta,
    goal,
    user: getUserLevelData(user?.xp ?? 0),
  });
}
