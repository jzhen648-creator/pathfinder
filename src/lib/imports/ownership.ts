export type OwnedImportEntity = {
  entity: "source" | "capture" | "observation" | "proposal" | "chapter" | "revision";
  id: string;
  userId: string;
};

export class ImportOwnershipError extends Error {
  readonly code = "IMPORT_OWNERSHIP_MISMATCH";

  constructor(
    readonly requestUserId: string,
    readonly mismatches: readonly OwnedImportEntity[],
  ) {
    super("Import graph contains an entity that does not belong to the authenticated user.");
    this.name = "ImportOwnershipError";
  }
}

/** Run before any transaction links sources, observations, chapters, or revisions. */
export function assertImportGraphOwnership(
  requestUserId: string,
  entities: readonly OwnedImportEntity[],
): void {
  const mismatches = entities.filter((entity) => entity.userId !== requestUserId);
  if (mismatches.length > 0) {
    throw new ImportOwnershipError(requestUserId, mismatches);
  }
}
