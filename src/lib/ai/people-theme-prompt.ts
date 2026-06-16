/** Pursuit insight body rules when themeId is "people" — user-approved 2026-06-17. */
export const PEOPLE_THEME_BODY_CLAUSE = [
  'PEOPLE THEME (pursuit body only — when themeId is "people"):',
  'For pursuits where themeId is "people":',
  "Write the body as an observation, not a prescription.",
  "Do not suggest specific actions toward another person",
  '(e.g. "invite them to dinner", "send a message", "schedule a call")',
  "unless the user's own description or marks explicitly support them.",
  "Reflect what the map shows — distance, intention, or effort named",
  "by the user — and leave room for what you don't know.",
  "One genuine question is permitted; tactical scripts are not.",
].join("\n");

export function shouldApplyPeopleThemeBodyRules(themeId: string | undefined): boolean {
  return themeId === "people";
}
