export const lifeWheelAreas = [
  { key: "careerPurpose", label: "Career and Purpose", color: "#6366f1", aliases: ["career", "work", "purpose"] },
  { key: "finances", label: "Finances", color: "#f59e0b", aliases: ["finance", "financial", "money", "business"] },
  { key: "healthFitness", label: "Health and Fitness", color: "#10b981", aliases: ["health", "fitness"] },
  { key: "relationships", label: "Relationships", color: "#ec4899", aliases: ["relationship", "social", "family"] },
  { key: "personalGrowth", label: "Personal Growth", color: "#8b5cf6", aliases: ["personal", "growth", "education", "learning"] },
  { key: "mentalWellbeing", label: "Mental Wellbeing", color: "#06b6d4", aliases: ["mental", "mindset", "wellbeing"] },
  { key: "funRecreation", label: "Fun and Recreation", color: "#f97316", aliases: ["fun", "recreation", "hobby"] },
  { key: "environmentLifestyle", label: "Environment and Lifestyle", color: "#94a3b8", aliases: ["environment", "lifestyle", "home"] },
] as const;

export type LifeWheelAreaKey = (typeof lifeWheelAreas)[number]["key"];

export type GoalProgressItem = {
  id: string;
  title: string;
  lifeArea: string;
  progress: number;
};

export type LifeWheelAreaSummary = {
  key: LifeWheelAreaKey;
  label: string;
  color: string;
  score: number;
  goals: GoalProgressItem[];
};

export function resolveWheelAreaKey(input: string): LifeWheelAreaKey {
  const normalized = input.trim().toLowerCase();
  const match = lifeWheelAreas.find((area) =>
    area.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized)),
  );
  return match?.key ?? "personalGrowth";
}

export function allAreasBalanced(summaries: LifeWheelAreaSummary[]) {
  return summaries.every((area) => area.score >= 7);
}
