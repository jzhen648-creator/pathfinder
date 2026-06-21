export const ONBOARDING_EDUCATION_PURSUIT_TITLE = "Finished formal education";

export type OnboardingEducationLevel = "secondary" | "further" | "higher";

export const ONBOARDING_EDUCATION_THEME_ID = "work" as const;

export const ONBOARDING_EDUCATION_CATEGORY_LABEL = "Education & courses";

export const ONBOARDING_EDUCATION_MILESTONES = [
  { position: 1, title: "Primary school" },
  { position: 2, title: "Secondary school" },
  { position: 3, title: "Further education (A-levels, college, or equivalent)" },
  { position: 4, title: "Higher education (university degree)" },
] as const;

export function completedEducationMilestonePositions(
  level: OnboardingEducationLevel,
): ReadonlySet<number> {
  switch (level) {
    case "secondary":
      return new Set([1, 2]);
    case "further":
      return new Set([1, 2, 3]);
    case "higher":
      return new Set([1, 2, 3, 4]);
  }
}

export function buildEducationMilestoneRows(
  level: OnboardingEducationLevel,
  completedAt: Date,
): Array<{ position: number; title: string; description: string; completedAt: Date | null }> {
  const completed = completedEducationMilestonePositions(level);
  return ONBOARDING_EDUCATION_MILESTONES.map((row) => ({
    position: row.position,
    title: row.title,
    description: "",
    completedAt: completed.has(row.position) ? completedAt : null,
  }));
}
