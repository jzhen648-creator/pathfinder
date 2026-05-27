import { LIFE_AREAS } from "@/lib/life-areas";
import type { LifeArea, LifeAreaId } from "@/lib/types";

export const ONBOARDING_DEFAULT_THEME_ID = "work" satisfies LifeAreaId;

const ONBOARDING_THEME_IDS = [
  ONBOARDING_DEFAULT_THEME_ID,
  "finance",
  "becoming",
  "people",
  "health",
] as const satisfies readonly LifeAreaId[];

export const ONBOARDING_THEME_AREAS: readonly LifeArea[] = ONBOARDING_THEME_IDS.map((id) => {
  const area = LIFE_AREAS.find((candidate) => candidate.id === id);
  if (!area) throw new Error(`Missing onboarding theme: ${id}`);
  return area;
});
