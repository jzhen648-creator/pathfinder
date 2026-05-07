import { prisma } from "@/lib/prisma";

export async function getGoalWithProgress(goalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    include: {
      forkedGoals: { select: { id: true } },
      milestones: {
        orderBy: { position: "asc" },
        include: {
          subtasks: {
            orderBy: { position: "asc" },
            include: {
              dailyTasks: {
                orderBy: { position: "asc" },
              },
              checkpoints: {
                orderBy: { position: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!goal) {
    return null;
  }

  const milestones = goal.milestones.map((milestone, index, allMilestones) => {
    const completedSubtasks = milestone.subtasks.filter((task) => task.isCompleted).length;
    const totalSubtasks = milestone.subtasks.length;
    const progress = totalSubtasks === 0 ? 0 : Math.round((completedSubtasks / totalSubtasks) * 100);
    const previousMilestonesCompleted = allMilestones
      .slice(0, index)
      .every((entry) => entry.subtasks.every((task) => task.isCompleted));
    const isCompleted = completedSubtasks === totalSubtasks;
    const isUnlocked = index === 0 || previousMilestonesCompleted;
    const isActive = isUnlocked && !isCompleted;

    return {
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      position: milestone.position,
      progress,
      isCompleted,
      isUnlocked,
      isActive,
      subtasks: milestone.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        isCompleted: subtask.isCompleted,
        dailyTasks: subtask.dailyTasks.map((dailyTask) => ({
          id: dailyTask.id,
          title: dailyTask.title,
        })),
        checkpoints: subtask.checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          title: checkpoint.title,
        })),
      })),
    };
  });

  const totalSubtasks = milestones.reduce((sum, milestone) => sum + milestone.subtasks.length, 0);
  const completedSubtasks = milestones.reduce(
    (sum, milestone) => sum + milestone.subtasks.filter((task) => task.isCompleted).length,
    0,
  );
  const goalProgress = totalSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

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
    bloomStatus: goal.bloomStatus,
    bloomedAt: goal.bloomedAt?.toISOString() ?? null,
    endedAt: goal.endedAt?.toISOString() ?? null,
    endReason: goal.endReason,
    parentGoalId: goal.parentGoalId,
    positionAngle: goal.positionAngle,
    forkedGoals: goal.forkedGoals.map((f) => ({ id: f.id })),
    milestones,
  };
}
