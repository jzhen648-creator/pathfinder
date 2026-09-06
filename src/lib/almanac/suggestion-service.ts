import { createHash, randomUUID } from "node:crypto";
import {
  AlmanacImportScope,
  AlmanacSuggestionDecisionKind,
  AlmanacSuggestionStatus,
  AlmanacUpdateState,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AcceptAlmanacSuggestionRequest,
  MutateAlmanacSuggestionRequest,
  StageAlmanacSuggestionsRequest,
  UndoAlmanacSuggestionAcceptanceRequest,
} from "@/lib/almanac/contracts";
import { lockAlmanacOwner } from "@/lib/almanac/owner-lock";
import {
  ALMANAC_PROTOCOL_VERSION,
  almanacUpdateFingerprint,
  normaliseAlmanacPlaceName,
  parseAlmanacPacket,
} from "@/lib/almanac/protocol";
import {
  nextSuggestionApplicationSequence,
  resolveSuggestionOperation,
} from "@/lib/almanac/suggestion-lifecycle-policy";
import {
  AlmanacConflictError,
  AlmanacNotFoundError,
  AlmanacValidationError,
} from "@/lib/almanac/service";

const TRANSACTION_ATTEMPTS = 3;
type Transaction = Prisma.TransactionClient;

const SUGGESTION_INCLUDE = {
  import: { select: { undoneAt: true } },
  routedPlace: { select: { id: true, name: true } },
  applications: {
    where: { revertedAt: null },
    include: { update: { select: { id: true } } },
    orderBy: { applicationSequence: "desc" },
    take: 1,
  },
} satisfies Prisma.AlmanacSuggestionInclude;

type StoredSuggestion = Prisma.AlmanacSuggestionGetPayload<{
  include: typeof SUGGESTION_INCLUDE;
}>;

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializable<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (attempt === TRANSACTION_ATTEMPTS ||
        (!hasPrismaCode(error, "P2002") && !hasPrismaCode(error, "P2034"))) {
        throw error;
      }
    }
  }
  throw new Error("Almanac Suggestion transaction retry loop exited unexpectedly.");
}

function scopeToDatabase(scope: "chat" | "project" | "bootstrap"): AlmanacImportScope {
  return AlmanacImportScope[scope.toUpperCase() as keyof typeof AlmanacImportScope];
}

function requestHash(value: object): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asInputJson(value: object): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isPersistentSuggestionReceipt(value: Prisma.JsonValue): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    value["mode"] === "persistent_suggestions";
}

function serializeSuggestion(suggestion: StoredSuggestion) {
  const activeApplication = suggestion.applications[0] ?? null;
  return {
    id: suggestion.id,
    importId: suggestion.importId,
    sourceLineNumber: suggestion.sourceLineNumber,
    original: {
      subjectName: suggestion.originalSubjectName,
      state: suggestion.originalState,
      statement: suggestion.originalText,
    },
    draft: {
      subjectName: suggestion.draftSubjectName,
      state: suggestion.draftState,
      statement: suggestion.draftText,
      placeId: suggestion.routedPlaceId,
      placeName: suggestion.routedPlace?.name ?? null,
      supersedesUpdateId: suggestion.supersedesUpdateId,
    },
    status: suggestion.status.toLowerCase(),
    version: suggestion.version,
    sourceUndone: suggestion.import.undoneAt !== null,
    activeApplication: activeApplication ? {
      id: activeApplication.id,
      sequence: activeApplication.applicationSequence,
      acceptedAt: activeApplication.acceptedAt.toISOString(),
      updateId: activeApplication.update?.id ?? null,
    } : null,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}

async function loadSuggestion(
  tx: Transaction,
  userId: string,
  suggestionId: string,
): Promise<StoredSuggestion> {
  const suggestion = await tx.almanacSuggestion.findFirst({
    where: { id: suggestionId, userId },
    include: SUGGESTION_INCLUDE,
  });
  if (!suggestion) throw new AlmanacNotFoundError("Suggestion not found.");
  return suggestion;
}

async function operationGate(
  tx: Transaction,
  userId: string,
  suggestion: StoredSuggestion,
  operationKey: string,
  hash: string,
  expectedVersion: number,
): Promise<{ replay: Prisma.JsonValue | null }> {
  const stored = await tx.almanacSuggestionDecision.findUnique({
    where: { userId_operationKey: { userId, operationKey } },
    select: { requestHash: true, result: true },
  });
  const gate = resolveSuggestionOperation({
    storedOperation: stored,
    requestHash: hash,
    expectedVersion,
    currentVersion: suggestion.version,
  });
  if (gate.disposition === "replay") return { replay: gate.result };
  if (gate.disposition === "operation_key_conflict") {
    throw new AlmanacConflictError("That operation key was already used for a different request.");
  }
  if (gate.disposition === "stale_version") {
    throw new AlmanacConflictError(
      `Suggestion changed since it was loaded. Current version: ${gate.currentVersion}.`,
    );
  }
  return { replay: null };
}

async function storeDecision(
  tx: Transaction,
  input: {
    id: string;
    userId: string;
    suggestionId: string;
    operationKey: string;
    hash: string;
    kind: AlmanacSuggestionDecisionKind;
    expectedVersion: number;
    resultVersion: number;
    result: object;
  },
): Promise<void> {
  await tx.almanacSuggestionDecision.create({
    data: {
      id: input.id,
      userId: input.userId,
      suggestionId: input.suggestionId,
      operationKey: input.operationKey,
      requestHash: input.hash,
      kind: input.kind,
      expectedVersion: input.expectedVersion,
      resultVersion: input.resultVersion,
      result: asInputJson(input.result),
    },
  });
}

export async function listAlmanacSuggestions(userId: string) {
  const suggestions = await prisma.almanacSuggestion.findMany({
    where: { userId },
    include: SUGGESTION_INCLUDE,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return { suggestions: suggestions.map(serializeSuggestion) };
}

export async function stageAlmanacSuggestions(
  userId: string,
  input: StageAlmanacSuggestionsRequest,
) {
  const packet = parseAlmanacPacket(input.rawPacket);
  if (packet.fatalErrors.length > 0 || !packet.scope) {
    throw new AlmanacValidationError(
      packet.fatalErrors[0]?.message ?? "The Almanac packet is invalid.",
    );
  }
  const packetScope = packet.scope;

  return runSerializable(async (tx) => {
    await lockAlmanacOwner(tx, userId);
    const prior = await tx.almanacImport.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: { suggestions: { include: SUGGESTION_INCLUDE } },
    });
    if (prior) {
      if (prior.rawPacket !== input.rawPacket || prior.protocolVersion !== ALMANAC_PROTOCOL_VERSION) {
        throw new AlmanacConflictError(
          "That idempotency key was already used for a different Almanac source.",
        );
      }
      if (!isPersistentSuggestionReceipt(prior.receipt)) {
        throw new AlmanacConflictError(
          "That idempotency key belongs to a non-Suggestion Almanac Import.",
        );
      }
      return {
        disposition: "idempotent_retry" as const,
        importId: prior.id,
        suggestions: prior.suggestions.map(serializeSuggestion),
        receipt: prior.receipt,
      };
    }

    const normalisedNames = [...new Set(packet.updates.map((update) =>
      normaliseAlmanacPlaceName(update.placeName)
    ))];
    const places = await tx.almanacPlace.findMany({
      where: { userId, normalisedName: { in: normalisedNames } },
      select: { id: true, normalisedName: true },
    });
    const placeIdByName = new Map(places.map((place) => [place.normalisedName, place.id]));
    const seen = new Set<string>();
    const staged = packet.updates.flatMap((update) => {
      const normalisedName = normaliseAlmanacPlaceName(update.placeName);
      const packetIdentity = `${normalisedName}\u001e${almanacUpdateFingerprint(
        update.state,
        update.statement,
      )}`;
      if (seen.has(packetIdentity)) return [];
      seen.add(packetIdentity);
      return [{
        id: randomUUID(),
        userId,
        sourceLineNumber: update.lineNumber,
        originalSubjectName: update.placeName,
        originalState: AlmanacUpdateState[update.state],
        originalText: update.statement,
        draftSubjectName: update.placeName,
        draftState: AlmanacUpdateState[update.state],
        draftText: update.statement,
        routedPlaceId: placeIdByName.get(normalisedName) ?? null,
      }];
    });
    const stagedLines = new Set(staged.map((suggestion) => suggestion.sourceLineNumber));
    const receiptLines = [
      ...packet.updates.map((update) => ({
        lineNumber: update.lineNumber,
        outcome: stagedLines.has(update.lineNumber) ? "staged" : "duplicate",
        reason: stagedLines.has(update.lineNumber) ? "staged_for_review" : "duplicate_in_packet",
      })),
      ...packet.invalidLines.map((line) => ({
        lineNumber: line.lineNumber,
        outcome: "invalid",
        reason: line.code,
      })),
    ].sort((left, right) => left.lineNumber - right.lineNumber);
    const receipt = {
      version: 2,
      mode: "persistent_suggestions",
      lines: receiptLines,
      counts: {
        staged: staged.length,
        accepted: 0,
        rejected: 0,
        newPlaces: 0,
        duplicates: receiptLines.filter((line) => line.outcome === "duplicate").length,
        invalid: packet.invalidLines.length,
      },
    };
    const imported = await tx.almanacImport.create({
      data: {
        userId,
        idempotencyKey: input.idempotencyKey,
        protocolVersion: ALMANAC_PROTOCOL_VERSION,
        scope: scopeToDatabase(packetScope),
        rawPacket: input.rawPacket,
        receipt: asInputJson(receipt),
      },
    });
    if (staged.length > 0) {
      await tx.almanacSuggestion.createMany({
        data: staged.map((suggestion) => ({ ...suggestion, importId: imported.id })),
      });
    }
    const suggestions = await tx.almanacSuggestion.findMany({
      where: { importId: imported.id, userId },
      include: SUGGESTION_INCLUDE,
      orderBy: { sourceLineNumber: "asc" },
    });
    return {
      disposition: "created" as const,
      importId: imported.id,
      suggestions: suggestions.map(serializeSuggestion),
      receipt,
    };
  });
}

export async function mutateAlmanacSuggestion(
  userId: string,
  suggestionId: string,
  input: MutateAlmanacSuggestionRequest,
) {
  const hash = requestHash(input);
  return runSerializable(async (tx) => {
    await lockAlmanacOwner(tx, userId);
    const suggestion = await loadSuggestion(tx, userId, suggestionId);
    const gate = await operationGate(
      tx,
      userId,
      suggestion,
      input.operationKey,
      hash,
      input.expectedVersion,
    );
    if (gate.replay) return gate.replay;

    const resultVersion = suggestion.version + 1;
    let kind: AlmanacSuggestionDecisionKind;
    let data: Prisma.AlmanacSuggestionUncheckedUpdateInput;
    if (input.action === "dismiss") {
      if (suggestion.status !== AlmanacSuggestionStatus.PENDING) {
        throw new AlmanacConflictError("Only a pending Suggestion can be dismissed.");
      }
      kind = AlmanacSuggestionDecisionKind.DISMISS;
      data = { status: AlmanacSuggestionStatus.DISMISSED, version: resultVersion };
    } else if (input.action === "restore") {
      if (suggestion.status !== AlmanacSuggestionStatus.DISMISSED) {
        throw new AlmanacConflictError("Only a dismissed Suggestion can be restored.");
      }
      kind = AlmanacSuggestionDecisionKind.RESTORE;
      data = { status: AlmanacSuggestionStatus.PENDING, version: resultVersion };
    } else {
      if (suggestion.status !== AlmanacSuggestionStatus.PENDING) {
        throw new AlmanacConflictError("Only a pending Suggestion can be edited.");
      }
      kind = AlmanacSuggestionDecisionKind.EDIT;
      let routedPlaceId = suggestion.routedPlaceId;
      if (input.placeId !== undefined) {
        if (input.placeId !== null) {
          const place = await tx.almanacPlace.findFirst({
            where: { id: input.placeId, userId },
            select: { id: true },
          });
          if (!place) throw new AlmanacValidationError("The selected Subject does not exist.");
        }
        routedPlaceId = input.placeId;
      } else if (input.subjectName !== undefined) {
        const matchedPlace = await tx.almanacPlace.findUnique({
          where: {
            userId_normalisedName: {
              userId,
              normalisedName: normaliseAlmanacPlaceName(input.subjectName),
            },
          },
          select: { id: true },
        });
        routedPlaceId = matchedPlace?.id ?? null;
      }
      if (input.supersedesUpdateId) {
        const predecessor = await tx.almanacUpdate.findFirst({
          where: { id: input.supersedesUpdateId, userId },
          select: { id: true },
        });
        if (!predecessor) {
          throw new AlmanacValidationError("The selected predecessor Update does not exist.");
        }
      }
      data = {
        draftSubjectName: input.subjectName ?? suggestion.draftSubjectName,
        draftState: input.state ? AlmanacUpdateState[input.state] : suggestion.draftState,
        draftText: input.statement ?? suggestion.draftText,
        routedPlaceId,
        supersedesUpdateId: input.supersedesUpdateId,
        version: resultVersion,
      };
    }

    const result = { disposition: "applied", suggestionId, version: resultVersion, action: input.action };
    await storeDecision(tx, {
      id: randomUUID(), userId, suggestionId, operationKey: input.operationKey, hash, kind,
      expectedVersion: input.expectedVersion, resultVersion, result,
    });
    await tx.almanacSuggestion.update({
      where: { id_userId: { id: suggestionId, userId } },
      data,
    });
    return result;
  });
}

async function resolveAcceptancePlace(
  tx: Transaction,
  userId: string,
  suggestion: StoredSuggestion,
): Promise<string> {
  let place = suggestion.routedPlaceId ? await tx.almanacPlace.findFirst({
    where: { id: suggestion.routedPlaceId, userId },
    include: { subjectPreference: true },
  }) : await tx.almanacPlace.findUnique({
    where: {
      userId_normalisedName: {
        userId,
        normalisedName: normaliseAlmanacPlaceName(suggestion.draftSubjectName),
      },
    },
    include: { subjectPreference: true },
  });
  if (place?.subjectPreference?.archivedAt) {
    throw new AlmanacConflictError("Restore the archived Subject before accepting this Suggestion.");
  }
  if (place?.subjectPreference?.mergedIntoPlaceId) {
    throw new AlmanacConflictError("Choose the combined Subject before accepting this Suggestion.");
  }
  if (!place) {
    const highestSlot = await tx.almanacPlace.aggregate({
      where: { userId },
      _max: { slot: true },
    });
    place = await tx.almanacPlace.create({
      data: {
        userId,
        name: suggestion.draftSubjectName,
        normalisedName: normaliseAlmanacPlaceName(suggestion.draftSubjectName),
        slot: (highestSlot._max.slot ?? 0) + 1,
      },
      include: { subjectPreference: true },
    });
  }
  return place.id;
}

type LineageUpdate = Prisma.AlmanacUpdateGetPayload<{
  include: {
    import: { select: { undoneAt: true } };
    suggestionApplication: { select: { revertedAt: true } };
    supersededBy: {
      include: {
        import: { select: { undoneAt: true } };
        suggestionApplication: { select: { revertedAt: true } };
      };
    };
    supersededByEdges: {
      include: {
        successor: {
          include: {
            import: { select: { undoneAt: true } };
            suggestionApplication: { select: { revertedAt: true } };
          };
        };
      };
    };
  };
}>;

const LINEAGE_INCLUDE = {
  import: { select: { undoneAt: true } },
  suggestionApplication: { select: { revertedAt: true } },
  supersededBy: {
    include: {
      import: { select: { undoneAt: true } },
      suggestionApplication: { select: { revertedAt: true } },
    },
  },
  supersededByEdges: {
    include: {
      successor: {
        include: {
          import: { select: { undoneAt: true } },
          suggestionApplication: { select: { revertedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.AlmanacUpdateInclude;

function updateIsActive(update: {
  import: { undoneAt: Date | null };
  suggestionApplication: { revertedAt: Date | null } | null;
}): boolean {
  return update.import.undoneAt === null &&
    (update.suggestionApplication === null || update.suggestionApplication.revertedAt === null);
}

function activeSuccessorIds(update: LineageUpdate): string[] {
  return [...new Set([
    ...update.supersededBy.filter(updateIsActive).map((successor) => successor.id),
    ...update.supersededByEdges
      .filter((edge) => updateIsActive(edge.successor))
      .map((edge) => edge.successor.id),
  ])];
}

export async function acceptAlmanacSuggestion(
  userId: string,
  suggestionId: string,
  input: AcceptAlmanacSuggestionRequest,
) {
  const hash = requestHash({ action: "accept", ...input });
  return runSerializable(async (tx) => {
    await lockAlmanacOwner(tx, userId);
    const suggestion = await loadSuggestion(tx, userId, suggestionId);
    const gate = await operationGate(tx, userId, suggestion, input.operationKey, hash, input.expectedVersion);
    if (gate.replay) return gate.replay;
    if (suggestion.status !== AlmanacSuggestionStatus.PENDING || suggestion.import.undoneAt) {
      throw new AlmanacConflictError("Only a pending Suggestion from an active source can be accepted.");
    }
    const placeId = await resolveAcceptancePlace(tx, userId, suggestion);
    if (suggestion.supersedesUpdateId) {
      const predecessor = await tx.almanacUpdate.findFirst({
        where: { id: suggestion.supersedesUpdateId, userId },
        include: LINEAGE_INCLUDE,
      });
      if (!predecessor || predecessor.placeId !== placeId || !updateIsActive(predecessor) ||
        activeSuccessorIds(predecessor).length > 0) {
        throw new AlmanacConflictError("The Update selected for revision is no longer current in this Subject.");
      }
    }
    const possibleDuplicates = await tx.almanacUpdate.findMany({
      where: {
        userId,
        placeId,
        normalisedFingerprint: almanacUpdateFingerprint(
          suggestion.draftState,
          suggestion.draftText,
        ),
      },
      include: LINEAGE_INCLUDE,
    });
    if (possibleDuplicates.some((update) =>
      update.id !== suggestion.supersedesUpdateId && updateIsActive(update) &&
      activeSuccessorIds(update).length === 0
    )) {
      throw new AlmanacConflictError("That Subject already has this current Update.");
    }

    const applications = await tx.almanacSuggestionApplication.findMany({
      where: { suggestionId, userId },
      select: { applicationSequence: true, revertedAt: true },
    });
    const sequence = nextSuggestionApplicationSequence(applications.map((application) => ({
      sequence: application.applicationSequence,
      reverted: application.revertedAt !== null,
    })));
    const decisionId = randomUUID();
    const applicationId = randomUUID();
    const updateId = randomUUID();
    const resultVersion = suggestion.version + 1;
    const result = {
      disposition: "accepted",
      suggestionId,
      version: resultVersion,
      applicationId,
      applicationSequence: sequence,
      updateId,
      placeId,
    };
    await storeDecision(tx, {
      id: decisionId, userId, suggestionId, operationKey: input.operationKey, hash,
      kind: AlmanacSuggestionDecisionKind.ACCEPT, expectedVersion: input.expectedVersion,
      resultVersion, result,
    });
    await tx.almanacSuggestionApplication.create({
      data: { id: applicationId, userId, suggestionId, decisionId, applicationSequence: sequence },
    });
    await tx.almanacUpdate.create({
      data: {
        id: updateId,
        userId,
        importId: suggestion.importId,
        placeId,
        state: suggestion.draftState,
        text: suggestion.draftText,
        normalisedFingerprint: almanacUpdateFingerprint(suggestion.draftState, suggestion.draftText),
        sourceLineNumber: suggestion.sourceLineNumber,
        suggestionApplicationId: applicationId,
        supersedesUpdateId: suggestion.supersedesUpdateId,
      },
    });
    if (suggestion.supersedesUpdateId) {
      await tx.almanacUpdateSupersession.create({
        data: {
          userId,
          successorUpdateId: updateId,
          predecessorUpdateId: suggestion.supersedesUpdateId,
        },
      });
    }
    await tx.almanacSuggestion.update({
      where: { id_userId: { id: suggestionId, userId } },
      data: { status: AlmanacSuggestionStatus.ACCEPTED, routedPlaceId: placeId, version: resultVersion },
    });
    return result;
  });
}

export async function undoAlmanacSuggestionAcceptance(
  userId: string,
  suggestionId: string,
  input: UndoAlmanacSuggestionAcceptanceRequest,
) {
  const hash = requestHash({ action: "undo_acceptance", ...input });
  return runSerializable(async (tx) => {
    await lockAlmanacOwner(tx, userId);
    const suggestion = await loadSuggestion(tx, userId, suggestionId);
    const gate = await operationGate(tx, userId, suggestion, input.operationKey, hash, input.expectedVersion);
    if (gate.replay) return gate.replay;
    if (suggestion.status !== AlmanacSuggestionStatus.ACCEPTED) {
      throw new AlmanacConflictError("Only an accepted Suggestion can be undone.");
    }
    const application = await tx.almanacSuggestionApplication.findFirst({
      where: { suggestionId, userId, revertedAt: null },
      include: { update: { include: LINEAGE_INCLUDE } },
    });
    if (!application?.update) {
      throw new AlmanacConflictError("The accepted Suggestion has no active application.");
    }
    const blockers = activeSuccessorIds(application.update);
    if (blockers.length > 0) {
      throw new AlmanacConflictError(
        `Undo the ${blockers.length} dependent Update${blockers.length === 1 ? "" : "s"} first.`,
      );
    }
    const resultVersion = suggestion.version + 1;
    const result = {
      disposition: "acceptance_undone",
      suggestionId,
      version: resultVersion,
      applicationId: application.id,
      updateId: application.update.id,
    };
    await storeDecision(tx, {
      id: randomUUID(), userId, suggestionId, operationKey: input.operationKey, hash,
      kind: AlmanacSuggestionDecisionKind.UNDO_ACCEPTANCE,
      expectedVersion: input.expectedVersion, resultVersion, result,
    });
    await tx.almanacSuggestionApplication.update({
      where: { id_userId: { id: application.id, userId } },
      data: { revertedAt: new Date() },
    });
    await tx.almanacSuggestion.update({
      where: { id_userId: { id: suggestionId, userId } },
      data: { status: AlmanacSuggestionStatus.PENDING, version: resultVersion },
    });
    return result;
  });
}
