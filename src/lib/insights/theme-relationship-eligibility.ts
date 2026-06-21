export type ConfirmedRelationshipRow = {
  goalAId: string;
  goalBId: string;
};

/** Theme ids that have at least one user-confirmed link touching a pursuit in that theme. */
export function themeIdsWithConfirmedLinks(
  relationships: ConfirmedRelationshipRow[],
  pursuitIdToThemeId: Map<string, string>,
): Set<string> {
  const themeIds = new Set<string>();
  for (const row of relationships) {
    const themeA = pursuitIdToThemeId.get(row.goalAId);
    const themeB = pursuitIdToThemeId.get(row.goalBId);
    if (themeA) themeIds.add(themeA);
    if (themeB) themeIds.add(themeB);
  }
  return themeIds;
}

export function themeHasConfirmedLinks(
  themeId: string,
  relationships: ConfirmedRelationshipRow[],
  pursuitIdToThemeId: Map<string, string>,
): boolean {
  for (const row of relationships) {
    const themeA = pursuitIdToThemeId.get(row.goalAId);
    const themeB = pursuitIdToThemeId.get(row.goalBId);
    if (themeA === themeId || themeB === themeId) return true;
  }
  return false;
}
