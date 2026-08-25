import {
  AlmanacImportScope,
  AlmanacUpdateState,
  Prisma,
  type AlmanacImport,
  type AlmanacPlace,
  type AlmanacUpdate,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CommitAlmanacImportRequest } from "@/lib/almanac/contracts";
import {
  ALMANAC_PROTOCOL_VERSION,
  almanacUpdateFingerprint,
  normaliseAlmanacPlaceName,
  parseAlmanacPacket,
  type AlmanacParsedUpdate,
  type AlmanacUpdateStateValue,
} from "@/lib/almanac/protocol";

const TRANSACTION_ATTEMPTS = 3;
const ATLAS_DISPERSION_ORDER = [
  0, 8, 14, 21, 29, 37, 42, 51, 53, 57, 60, 63, 3, 18, 27, 35,
  44, 46, 55, 61, 5, 11, 17, 23, 31, 39, 48, 52, 58, 2, 7, 13,
  20, 26, 32, 40, 47, 54, 62, 10, 1, 4, 6, 9, 12, 15, 16, 19,
  22, 24, 25, 28, 30, 33, 34, 36, 38, 41, 43, 45, 49, 50, 56, 59,
] as const;

type Transaction = Prisma.TransactionClient;
type StoredImport = AlmanacImport & { updates: AlmanacUpdate[] };

export type AlmanacReceiptLine = {
  lineNumber: number;
  outcome: "accepted" | "rejected" | "duplicate" | "invalid";
  reason:
    | "accepted"
    | "user_rejected"
    | "duplicate_in_packet"
    | "duplicate_existing_update"
    | "duplicate_after_place_resolution"
    | string;
};

export type AlmanacReceipt = {
  version: 1;
  lines: AlmanacReceiptLine[];
  counts: {
    accepted: number;
    rejected: number;
    newPlaces: number;
    duplicates: number;
    invalid: number;
  };
};

export class AlmanacValidationError extends Error {
  readonly code = "ALMANAC_VALIDATION";
}

export class AlmanacNotFoundError extends Error {
  readonly code = "ALMANAC_NOT_FOUND";
}

export class AlmanacConflictError extends Error {
  readonly code = "ALMANAC_CONFLICT";
}

export class AlmanacCapacityError extends Error {
  readonly code = "ALMANAC_CAPACITY";
}

export type AlmanacCommitTestHooks = {
  /** Integration-test failure injection; routes never provide hooks. */
  afterPlacesResolved?: () => void | Promise<void>;
};

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializable<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      const retryable = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!retryable || attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
  throw new Error("Almanac transaction retry loop exited unexpectedly");
}

async function lockOwner(transaction: Transaction, userId: string): Promise<void> {
  // One short transaction per owner at a time makes Place-name, slot and exact
  // duplicate decisions deterministic without locking unrelated users.
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text AS locked
  `;
}

function scopeToDatabase(scope: "chat" | "project" | "bootstrap"): AlmanacImportScope {
  return AlmanacImportScope[scope.toUpperCase() as keyof typeof AlmanacImportScope];
}

function stateToDatabase(state: AlmanacUpdateStateValue): AlmanacUpdateState {
  return AlmanacUpdateState[state];
}

function packetKey(update: AlmanacParsedUpdate): string {
  return `${normaliseAlmanacPlaceName(update.placeName)}\u001f${almanacUpdateFingerprint(update.state, update.statement)}`;
}

function parsedDecisionLines(updates: readonly AlmanacParsedUpdate[]) {
  const firstLineByKey = new Map<string, number>();
  const duplicateLines = new Set<number>();
  for (const update of updates) {
    const key = packetKey(update);
    if (firstLineByKey.has(key)) duplicateLines.add(update.lineNumber);
    else firstLineByKey.set(key, update.lineNumber);
  }
  return { firstLineByKey, duplicateLines };
}

export function validateAlmanacCommitRequest(input: CommitAlmanacImportRequest) {
  const packet = parseAlmanacPacket(input.rawPacket);
  if (packet.fatalErrors.length || !packet.scope) {
    throw new AlmanacValidationError(packet.fatalErrors[0]?.message ?? "Invalid ALMANAC/1 packet.");
  }
  const { duplicateLines } = parsedDecisionLines(packet.updates);
  const decisionByLine = new Map(input.decisions.map((decision) => [decision.lineNumber, decision]));
  const expectedDecisionLines = packet.updates
    .filter((update) => !duplicateLines.has(update.lineNumber))
    .map((update) => update.lineNumber);
  if (
    input.decisions.some((decision) => !expectedDecisionLines.includes(decision.lineNumber))
  ) {
    throw new AlmanacValidationError(
      "Every submitted decision must match a valid non-duplicate packet line.",
    );
  }
  return { packet, packetScope: packet.scope, duplicateLines, decisionByLine };
}

function nextSlot(places: readonly Pick<AlmanacPlace, "slot">[]): number {
  const occupied = new Set(places.map((place) => place.slot));
  const slot = ATLAS_DISPERSION_ORDER.find((candidate) => !occupied.has(candidate));
  if (slot === undefined) throw new AlmanacCapacityError("The Atlas has no free Place slots.");
  return slot;
}

async function validateSupersession(
  transaction: Transaction,
  userId: string,
  placeId: string,
  state: AlmanacUpdateStateValue,
  targetId: string,
): Promise<AlmanacUpdate> {
  if (state !== "NOW" && state !== "NEXT") {
    throw new AlmanacValidationError("Only NOW or NEXT Updates can explicitly supersede earlier wording.");
  }
  const target = await transaction.almanacUpdate.findFirst({
    where: { id: targetId, userId },
    include: { import: { select: { undoneAt: true } } },
  });
  if (!target) throw new AlmanacNotFoundError("Superseded Update not found.");
  if (target.import.undoneAt) {
    throw new AlmanacConflictError("An Update from an undone Import cannot be superseded.");
  }
  if (target.placeId !== placeId || target.state !== stateToDatabase(state)) {
    throw new AlmanacValidationError("Supersession must stay within the same Place and state.");
  }
  const activeSuccessor = await transaction.almanacUpdate.findFirst({
    where: {
      userId,
      supersedesUpdateId: target.id,
      import: { undoneAt: null },
    },
    select: { id: true },
  });
  if (activeSuccessor) {
    throw new AlmanacConflictError("The selected Update has already been superseded.");
  }

  // Reject a pre-existing corrupt chain rather than extending it. A newly
  // inserted row cannot itself be in this chain, so this is sufficient to
  // prevent creating a cycle through accepted service input.
  const visited = new Set<string>();
  let cursor: AlmanacUpdate | null = target;
  while (cursor?.supersedesUpdateId) {
    if (visited.has(cursor.id)) throw new AlmanacConflictError("Supersession cycle detected.");
    visited.add(cursor.id);
    cursor = await transaction.almanacUpdate.findFirst({
      where: { id: cursor.supersedesUpdateId, userId },
    });
    if (!cursor) throw new AlmanacConflictError("Supersession history is incomplete.");
  }
  return target;
}

async function hasCurrentDuplicate(
  transaction: Transaction,
  userId: string,
  placeId: string,
  fingerprint: string,
): Promise<boolean> {
  const candidates = await transaction.almanacUpdate.findMany({
    where: {
      userId,
      placeId,
      normalisedFingerprint: fingerprint,
      import: { undoneAt: null },
    },
    select: { id: true },
  });
  if (!candidates.length) return false;
  const activeSuccessors = await transaction.almanacUpdate.findMany({
    where: {
      userId,
      supersedesUpdateId: { in: candidates.map((candidate) => candidate.id) },
      import: { undoneAt: null },
    },
    select: { supersedesUpdateId: true },
  });
  const superseded = new Set(activeSuccessors.map((successor) => successor.supersedesUpdateId));
  return candidates.some((candidate) => !superseded.has(candidate.id));
}

function receiptFrom(value: Prisma.JsonValue): AlmanacReceipt {
  return value as unknown as AlmanacReceipt;
}

function serializeImport(imported: StoredImport) {
  return {
    id: imported.id,
    idempotencyKey: imported.idempotencyKey,
    protocolVersion: imported.protocolVersion,
    scope: imported.scope.toLowerCase(),
    rawPacket: imported.rawPacket,
    receipt: receiptFrom(imported.receipt),
    createdAt: imported.createdAt.toISOString(),
    undoneAt: imported.undoneAt?.toISOString() ?? null,
    updateIds: imported.updates.map((update) => update.id),
  };
}

function serializeUpdate(
  update: AlmanacUpdate,
  activeSuccessorId: string | null = null,
  importUndoneAt: Date | null = null,
) {
  return {
    id: update.id,
    placeId: update.placeId,
    importId: update.importId,
    state: update.state,
    statement: update.text,
    sourceLineNumber: update.sourceLineNumber,
    supersedesUpdateId: update.supersedesUpdateId,
    supersededByUpdateId: activeSuccessorId,
    createdAt: update.createdAt.toISOString(),
    active: importUndoneAt === null,
    current: importUndoneAt === null && activeSuccessorId === null,
  };
}

async function loadProjection(transaction: Transaction, userId: string) {
  const [places, updates, imports] = await Promise.all([
    transaction.almanacPlace.findMany({
      where: { userId },
      orderBy: [{ slot: "asc" }, { id: "asc" }],
    }),
    transaction.almanacUpdate.findMany({
      where: { userId },
      include: { import: { select: { undoneAt: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    transaction.almanacImport.findMany({
      where: { userId },
      include: { updates: { select: { id: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const activeSuccessorByTarget = new Map<string, string>();
  const activePlaceIds = new Set<string>();
  for (const update of updates) {
    if (update.import.undoneAt === null) activePlaceIds.add(update.placeId);
    if (update.supersedesUpdateId && update.import.undoneAt === null) {
      activeSuccessorByTarget.set(update.supersedesUpdateId, update.id);
    }
  }
  return {
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      normalisedName: place.normalisedName,
      slot: place.slot,
      createdAt: place.createdAt.toISOString(),
      active: activePlaceIds.has(place.id),
    })),
    updates: updates.map((update) =>
      serializeUpdate(
        update,
        activeSuccessorByTarget.get(update.id) ?? null,
        update.import.undoneAt,
      ),
    ),
    imports: imports.map((imported) => serializeImport(imported as StoredImport)),
  };
}

export async function loadAlmanacAtlas(userId: string) {
  return prisma.$transaction((transaction) => loadProjection(transaction, userId));
}

export async function loadAlmanacPlace(userId: string, placeId: string) {
  const place = await prisma.almanacPlace.findFirst({
    where: { id: placeId, userId },
    include: {
      updates: {
        include: { import: true, supersededBy: { include: { import: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!place) throw new AlmanacNotFoundError("Place not found.");
  return {
    id: place.id,
    name: place.name,
    normalisedName: place.normalisedName,
    slot: place.slot,
    createdAt: place.createdAt.toISOString(),
    active: place.updates.some((update) => update.import.undoneAt === null),
    updates: place.updates.map((update) => {
      const activeSuccessor = update.supersededBy.find((candidate) => candidate.import.undoneAt === null);
      return {
        ...serializeUpdate(update, activeSuccessor?.id ?? null, update.import.undoneAt),
        import: {
          id: update.import.id,
          scope: update.import.scope.toLowerCase(),
          rawPacket: update.import.rawPacket,
          createdAt: update.import.createdAt.toISOString(),
          undoneAt: update.import.undoneAt?.toISOString() ?? null,
        },
      };
    }),
  };
}

export async function loadAlmanacImport(userId: string, importId: string) {
  const imported = await prisma.almanacImport.findFirst({
    where: { id: importId, userId },
    include: { updates: { orderBy: { sourceLineNumber: "asc" } } },
  });
  if (!imported) throw new AlmanacNotFoundError("Import not found.");
  return {
    ...serializeImport(imported),
    updates: imported.updates.map((update) => serializeUpdate(update)),
  };
}

export async function commitAlmanacImport(
  userId: string,
  input: CommitAlmanacImportRequest,
  hooks: AlmanacCommitTestHooks = {},
) {
  const { packet, packetScope, duplicateLines, decisionByLine } =
    validateAlmanacCommitRequest(input);

  return runSerializable(async (transaction) => {
    await lockOwner(transaction, userId);
    const prior = await transaction.almanacImport.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: { updates: true },
    });
    if (prior) {
      if (prior.rawPacket !== input.rawPacket) {
        throw new AlmanacConflictError("The idempotency key was already used for another packet.");
      }
      return { disposition: "idempotent_retry" as const, import: serializeImport(prior), atlas: await loadProjection(transaction, userId) };
    }

    const allPlaces = await transaction.almanacPlace.findMany({ where: { userId } });
    const placeByNormalisedName = new Map(allPlaces.map((place) => [place.normalisedName, place]));
    const placeById = new Map(allPlaces.map((place) => [place.id, place]));
    const receiptLines: AlmanacReceiptLine[] = packet.invalidLines.map((invalid) => ({
      lineNumber: invalid.lineNumber,
      outcome: "invalid",
      reason: invalid.code,
    }));
    for (const lineNumber of duplicateLines) {
      receiptLines.push({ lineNumber, outcome: "duplicate", reason: "duplicate_in_packet" });
    }

    const accepted: Array<{
      parsed: AlmanacParsedUpdate;
      place: AlmanacPlace;
      supersedesUpdateId: string | null;
      fingerprint: string;
    }> = [];
    let newPlaces = 0;
    const seenResolved = new Set<string>();

    for (const parsed of packet.updates) {
      if (duplicateLines.has(parsed.lineNumber)) continue;
      const decision = decisionByLine.get(parsed.lineNumber);
      if (!decision) {
        const exactPlace = placeByNormalisedName.get(normaliseAlmanacPlaceName(parsed.placeName));
        const fingerprint = almanacUpdateFingerprint(parsed.state, parsed.statement);
        if (
          exactPlace &&
          await hasCurrentDuplicate(transaction, userId, exactPlace.id, fingerprint)
        ) {
          receiptLines.push({
            lineNumber: parsed.lineNumber,
            outcome: "duplicate",
            reason: "duplicate_existing_update",
          });
          continue;
        }
        throw new AlmanacValidationError(
          `Line ${parsed.lineNumber} needs an explicit accept or reject decision.`,
        );
      }
      if (!decision.accepted) {
        receiptLines.push({ lineNumber: parsed.lineNumber, outcome: "rejected", reason: "user_rejected" });
        continue;
      }

      const effectiveParsed: AlmanacParsedUpdate = {
        ...parsed,
        placeName: decision.subjectName ?? parsed.placeName,
        state: decision.state ?? parsed.state,
        statement: decision.statement ?? parsed.statement,
      };
      const normalisedName = normaliseAlmanacPlaceName(effectiveParsed.placeName);
      let place: AlmanacPlace | undefined;
      if (decision.placeId) {
        place = placeById.get(decision.placeId);
        if (!place) throw new AlmanacNotFoundError("Resolved Place not found.");
      } else {
        place = placeByNormalisedName.get(normalisedName);
        if (!place) {
          place = await transaction.almanacPlace.create({
            data: {
              userId,
              name: effectiveParsed.placeName,
              normalisedName,
              slot: nextSlot(allPlaces),
            },
          });
          allPlaces.push(place);
          placeByNormalisedName.set(normalisedName, place);
          placeById.set(place.id, place);
          newPlaces += 1;
        }
      }

      const fingerprint = almanacUpdateFingerprint(
        effectiveParsed.state,
        effectiveParsed.statement,
      );
      const resolvedKey = `${place.id}\u001f${fingerprint}`;
      if (seenResolved.has(resolvedKey)) {
        receiptLines.push({
          lineNumber: parsed.lineNumber,
          outcome: "duplicate",
          reason: "duplicate_after_place_resolution",
        });
        continue;
      }
      seenResolved.add(resolvedKey);

      if (await hasCurrentDuplicate(transaction, userId, place.id, fingerprint)) {
        receiptLines.push({
          lineNumber: parsed.lineNumber,
          outcome: "duplicate",
          reason: "duplicate_existing_update",
        });
        continue;
      }

      const supersedesUpdateId = decision.supersedesUpdateId ?? null;
      if (supersedesUpdateId) {
        await validateSupersession(
          transaction,
          userId,
          place.id,
          effectiveParsed.state,
          supersedesUpdateId,
        );
      }
      accepted.push({ parsed: effectiveParsed, place, supersedesUpdateId, fingerprint });
    }

    if (!accepted.length) {
      throw new AlmanacValidationError("The Import contains no accepted, non-duplicate Updates.");
    }
    await hooks.afterPlacesResolved?.();

    const receipt: AlmanacReceipt = {
      version: 1,
      lines: receiptLines
        .concat(accepted.map(({ parsed }) => ({ lineNumber: parsed.lineNumber, outcome: "accepted" as const, reason: "accepted" as const })))
        .sort((left, right) => left.lineNumber - right.lineNumber),
      counts: {
        accepted: accepted.length,
        rejected: receiptLines.filter((line) => line.outcome === "rejected").length,
        newPlaces,
        duplicates: receiptLines.filter((line) => line.outcome === "duplicate").length,
        invalid: receiptLines.filter((line) => line.outcome === "invalid").length,
      },
    };

    const imported = await transaction.almanacImport.create({
      data: {
        userId,
        idempotencyKey: input.idempotencyKey,
        protocolVersion: ALMANAC_PROTOCOL_VERSION,
        scope: scopeToDatabase(packetScope),
        rawPacket: input.rawPacket,
        receipt: receipt as unknown as Prisma.InputJsonValue,
      },
    });
    await transaction.almanacUpdate.createMany({
      data: accepted.map(({ parsed, place, supersedesUpdateId, fingerprint }) => ({
        userId,
        importId: imported.id,
        placeId: place.id,
        state: stateToDatabase(parsed.state),
        text: parsed.statement,
        normalisedFingerprint: fingerprint,
        sourceLineNumber: parsed.lineNumber,
        supersedesUpdateId,
      })),
    });
    const persistedImport = await transaction.almanacImport.findUniqueOrThrow({
      where: { id: imported.id },
      include: { updates: true },
    });
    return { disposition: "created" as const, import: serializeImport(persistedImport), atlas: await loadProjection(transaction, userId) };
  });
}

export async function undoAlmanacImport(userId: string, importId: string) {
  return runSerializable(async (transaction) => {
    await lockOwner(transaction, userId);
    const imported = await transaction.almanacImport.findFirst({
      where: { id: importId, userId },
      include: { updates: true },
    });
    if (!imported) throw new AlmanacNotFoundError("Import not found.");
    if (imported.undoneAt) {
      return { disposition: "already_undone" as const, import: serializeImport(imported), atlas: await loadProjection(transaction, userId) };
    }

    const updateIds = imported.updates.map((update) => update.id);
    const activeLaterSuccessor = await transaction.almanacUpdate.findFirst({
      where: {
        userId,
        supersedesUpdateId: { in: updateIds },
        import: { undoneAt: null, id: { not: importId } },
      },
      select: { id: true },
    });
    if (activeLaterSuccessor) {
      throw new AlmanacConflictError("Undo the newer superseding Import first.");
    }

    const undone = await transaction.almanacImport.update({
      where: { id: imported.id },
      data: { undoneAt: new Date() },
      include: { updates: true },
    });
    return { disposition: "undone" as const, import: serializeImport(undone), atlas: await loadProjection(transaction, userId) };
  });
}
