export type StoredSuggestionOperation<TResult> = {
  requestHash: string;
  result: TResult;
};

export type SuggestionOperationGate<TResult> =
  | { disposition: "apply" }
  | { disposition: "replay"; result: TResult }
  | { disposition: "operation_key_conflict" }
  | { disposition: "stale_version"; currentVersion: number };

/**
 * Applies idempotency before optimistic concurrency. A client reconciling an
 * uncertain response must receive the stored result even though the successful
 * first request already advanced the suggestion version.
 */
export function resolveSuggestionOperation<TResult>(input: {
  storedOperation: StoredSuggestionOperation<TResult> | null;
  requestHash: string;
  expectedVersion: number;
  currentVersion: number;
}): SuggestionOperationGate<TResult> {
  if (input.storedOperation) {
    return input.storedOperation.requestHash === input.requestHash
      ? { disposition: "replay", result: input.storedOperation.result }
      : { disposition: "operation_key_conflict" };
  }

  return input.expectedVersion === input.currentVersion
    ? { disposition: "apply" }
    : { disposition: "stale_version", currentVersion: input.currentVersion };
}

export type SuggestionApplicationState = {
  sequence: number;
  reverted: boolean;
};

/** Acceptance sequence numbers are historical identities and are never reused. */
export function nextSuggestionApplicationSequence(
  applications: readonly SuggestionApplicationState[],
): number {
  return applications.reduce((highest, application) => (
    Math.max(highest, application.sequence)
  ), 0) + 1;
}

export function isAlmanacUpdateActive(input: {
  importUndone: boolean;
  applicationReverted: boolean | null;
}): boolean {
  return !input.importUndone && input.applicationReverted !== true;
}

export type SupersessionDependency = {
  successorUpdateId: string;
  successorImportId: string;
  successorActive: boolean;
};

export function activeActionUndoBlockers(
  dependencies: readonly SupersessionDependency[],
): string[] {
  return dependencies
    .filter((dependency) => dependency.successorActive)
    .map((dependency) => dependency.successorUpdateId);
}

export function activeWholeSourceUndoBlockers(
  sourceImportId: string,
  dependencies: readonly SupersessionDependency[],
): string[] {
  return dependencies
    .filter((dependency) => (
      dependency.successorActive && dependency.successorImportId !== sourceImportId
    ))
    .map((dependency) => dependency.successorUpdateId);
}
