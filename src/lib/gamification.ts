export const XP_PER_LEVEL = 500;

export function getLevelFromXp(xp: number) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function getLevelProgress(xp: number) {
  const currentLevelXp = xp % XP_PER_LEVEL;
  return Math.round((currentLevelXp / XP_PER_LEVEL) * 100);
}
