import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { getGoalWithProgress } from "@/lib/roadmap";

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

  await prisma.subtask.update({
    where: { id: subtaskId },
    data: {
      isCompleted: willComplete,
      completedAt: willComplete ? new Date() : null,
    },
  });

  // Primary production hook today for relational bloom persistence after milestone graph changes.
  await recomputeGoalBloomStatus(subtask.milestone.goalId);

  const goal = await getGoalWithProgress(subtask.milestone.goalId, userId);

  return NextResponse.json({
    goal,
  });
}
