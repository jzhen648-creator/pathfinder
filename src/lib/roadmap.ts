import { prisma } from "@/lib/prisma";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";

export async function getGoalWithProgress(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    include: {
      forkedGoals: { select: { id: true } },
      milestones: {
        orderBy: { position: "asc" },
      },
    },
  });

  if (!goal) {
    return null;
  }

  const milestones = goal.milestones.map((milestone, index, allMilestones) => {
    const progress = milestone.completedAt ? 100 : 0;
    const previousMilestonesCompleted = allMilestones.slice(0, index).every((entry) =>
      milestoneDoneForSemantics({
        completedAt: entry.completedAt,
        subtasks: [],
      }),
    );
    const isCompleted = milestoneDoneForSemantics({
      completedAt: milestone.completedAt,
      subtasks: [],
    });
    const isUnlocked = index === 0 || previousMilestonesCompleted;
    const isActive = isUnlocked && !isCompleted;

    return {
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      position: milestone.position,
      completedAt: milestone.completedAt?.toISOString() ?? null,
      progress,
      isCompleted,
      isUnlocked,
      isActive,
      subtasks: [],
    };
  });

  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((milestone) => milestone.isCompleted).length;
  const goalProgress = totalMilestones
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    lifeArea: goal.lifeArea,
    goalType: goal.goalType,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    deadline: goal.deadline?.toISOString() ?? null,
    progress: goalProgress,
    status: goal.status,
    completedAt: goal.completedAt?.toISOString() ?? null,
    endedAt: goal.endedAt?.toISOString() ?? null,
    endReason: goal.endReason,
    parentGoalId: goal.parentGoalId,
    forkedGoals: goal.forkedGoals.map((f) => ({ id: f.id })),
    milestones,
  };
}
