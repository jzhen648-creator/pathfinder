import { lifeWheelAreas, resolveWheelAreaKey, type GoalProgressItem, type LifeWheelAreaSummary } from "@/lib/life-wheel";

type GoalInput = {
  id: string;
  title: string;
  lifeArea: string;
  milestones: {
    subtasks: { isCompleted: boolean }[];
  }[];
};

function roundScore(value: number) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

export function getGoalProgress(goal: GoalInput) {
  const totalMilestones = goal.milestones.length;
  const completedMilestones = goal.milestones.filter((m) => m.subtasks.length > 0 && m.subtasks.every((s) => s.isCompleted)).length;
  const allSubtasks = goal.milestones.flatMap((m) => m.subtasks);
  const completedSubtasks = allSubtasks.filter((s) => s.isCompleted).length;
  const milestoneRatio = totalMilestones > 0 ? completedMilestones / totalMilestones : 0;
  const taskRatio = allSubtasks.length > 0 ? completedSubtasks / allSubtasks.length : 0;
  const combined = (milestoneRatio + taskRatio) / 2;
  return Math.round(combined * 100);
}

export function buildLifeWheelSummary(goals: GoalInput[]): LifeWheelAreaSummary[] {
  const areaGoals = new Map<string, GoalProgressItem[]>();
  for (const goal of goals) {
    const areaKey = resolveWheelAreaKey(goal.lifeArea);
    const item: GoalProgressItem = {
      id: goal.id,
      title: goal.title,
      lifeArea: goal.lifeArea,
      progress: getGoalProgress(goal),
    };
    const existing = areaGoals.get(areaKey) ?? [];
    areaGoals.set(areaKey, [...existing, item]);
  }

  return lifeWheelAreas.map((area) => {
    const goalsInArea = areaGoals.get(area.key) ?? [];
    if (goalsInArea.length === 0) {
      return { key: area.key, label: area.label, color: area.color, score: 0, goals: [] };
    }
    const avgGoalProgress = goalsInArea.reduce((sum, g) => sum + g.progress, 0) / goalsInArea.length;
    return {
      key: area.key,
      label: area.label,
      color: area.color,
      score: roundScore(avgGoalProgress / 10),
      goals: goalsInArea.sort((a, b) => b.progress - a.progress),
    };
  });
}
