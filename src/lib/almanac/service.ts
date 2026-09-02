import {
  AlmanacImportScope,
  AlmanacTargetDatePrecision,
  AlmanacUpdateSignificance,
  AlmanacUpdateState,
  Prisma,
  type AlmanacImport,
  type AlmanacPlace,
  type AlmanacUpdate,
  type AlmanacUpdatePreference,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CommitAlmanacImportRequest,
  CreateDirectAlmanacSubjectUpdateRequest,
  MergeAlmanacSubjectsRequest,
  UpdateAlmanacUpdatePreferenceRequest,
  UpdateAlmanacSubjectRequest,
} from "@/lib/almanac/contracts";
import {
  ALMANAC_PROTOCOL_VERSION,
  ALMANAC_UPDATE_TEXT_MAX_LENGTH,
  ALMANAC_USER_PROTOCOL_VERSION,
  almanacOriginKindForSource,
  almanacUpdateFingerprint,
  normaliseAlmanacPlaceName,
  parseAlmanacPacket,
  type AlmanacParsedUpdate,
  type AlmanacSourceScopeValue,
  type AlmanacUpdateStateValue,
} from "@/lib/almanac/protocol";
import { lockAlmanacOwner } from "@/lib/almanac/owner-lock";

const TRANSACTION_ATTEMPTS = 3;
type Transaction = Prisma.TransactionClient;
type StoredImport = AlmanacImport & { updates: AlmanacUpdate[] };
type StoredUpdate = AlmanacUpdate & {
  import: Pick<
    AlmanacImport,
    "id" | "protocolVersion" | "scope" | "rawPacket" | "createdAt" | "undoneAt"
  >;
  visibilityPreference: AlmanacUpdatePreference | null;
  supersedesEdges: Array<{ predecessorUpdateId: string }>;
  supersededBy: Array<{
    id: string;
    import: Pick<AlmanacImport, "undoneAt">;
  }>;
  supersededByEdges: Array<{
    successorUpdateId: string;
    successor: { import: Pick<AlmanacImport, "undoneAt"> };
  }>;
};

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
  /**
   * Canonical user decisions for this AI-response Import. The immutable raw
   * packet already lives on AlmanacImport, so the two values together are the
   * complete idempotency identity without storing the packet twice.
   */
  importRequest?: AlmanacImportRequestReceipt;
  lines: AlmanacReceiptLine[];
  counts: {
    accepted: number;
    rejected: number;
    newPlaces: number;
    duplicates: number;
    invalid: number;
  };
};

type AlmanacImportDecisionReceipt = {
  lineNumber: number;
  accepted: boolean;
  placeId: string | null;
  supersedesUpdateId: string | null;
  subjectName: string | null;
  state: AlmanacUpdateStateValue | null;
  statement: string | null;
};

type AlmanacImportRequestReceipt = {
  version: 1;
  decisions: AlmanacImportDecisionReceipt[];
};

type DirectTargetDateReceipt = {
  precision: "YEAR" | "MONTH" | "DAY";
  year: number;
  month: number | null;
  day: number | null;
};

type DirectRequestReceipt = {
  subjectId: string;
  action: "correction" | "outcome" | "resolution";
  state: AlmanacUpdateStateValue;
  statement: string;
  supersedesUpdateIds: string[];
  curation: {
    significance: "STANDARD" | "KEY";
    targetDate: DirectTargetDateReceipt | null;
  };
};

export type AlmanacDirectReceipt = AlmanacReceipt & {
  directRequest: DirectRequestReceipt;
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

export type AlmanacCommitTestHooks = {
  /** Integration-test failure injection; routes never provide hooks. */
  afterPlacesResolved?: () => void | Promise<void>;
};

export type AlmanacDirectUpdateTestHooks = {
  /** Integration-test concurrency hook; routes never provide hooks. */
  afterTargetsValidated?: () => void | Promise<void>;
};

export type AlmanacLoadTestHooks = {
  /** Integration-test snapshot hook; routes never provide hooks. */
  afterPlacesLoaded?: () => void | Promise<void>;
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

function scopeToDatabase(scope: "chat" | "project" | "bootstrap"): AlmanacImportScope {
  return AlmanacImportScope[scope.toUpperCase() as keyof typeof AlmanacImportScope];
}

function stateToDatabase(state: AlmanacUpdateStateValue): AlmanacUpdateState {
  return AlmanacUpdateState[state];
}

const STORED_UPDATE_INCLUDE = {
  import: {
    select: {
      id: true,
      protocolVersion: true,
      scope: true,
      rawPacket: true,
      createdAt: true,
      undoneAt: true,
    },
  },
  visibilityPreference: true,
  supersedesEdges: { select: { predecessorUpdateId: true } },
  supersededBy: {
    select: {
      id: true,
      import: { select: { undoneAt: true } },
    },
  },
  supersededByEdges: {
    select: {
      successorUpdateId: true,
      successor: { select: { import: { select: { undoneAt: true } } } },
    },
  },
} satisfies Prisma.AlmanacUpdateInclude;

function originKindForImport(
  imported: Pick<AlmanacImport, "protocolVersion" | "scope">,
) {
  const scope = imported.scope.toLowerCase() as AlmanacSourceScopeValue;
  const originKind = almanacOriginKindForSource(imported.protocolVersion, scope);
  if (!originKind) {
    throw new AlmanacConflictError("The stored Almanac source has invalid provenance.");
  }
  return originKind;
}

function canonicalTargetDate(
  targetDate: DirectTargetDateReceipt | null | undefined,
): DirectTargetDateReceipt | null {
  if (!targetDate) return null;
  return {
    precision: targetDate.precision,
    year: targetDate.year,
    month: targetDate.month ?? null,
    day: targetDate.day ?? null,
  };
}

function targetDateToDatabase(targetDate: DirectTargetDateReceipt): Date {
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(
    targetDate.year,
    (targetDate.month ?? 1) - 1,
    targetDate.day ?? 1,
  );
  return value;
}

function serializeTargetDate(
  targetDate: Date | null,
  precision: AlmanacTargetDatePrecision | null,
): DirectTargetDateReceipt | null {
  if (!targetDate && !precision) return null;
  if (!targetDate || !precision) {
    throw new AlmanacConflictError("The stored Almanac target date is incomplete.");
  }
  return {
    precision,
    year: targetDate.getUTCFullYear(),
    month: precision === "YEAR" ? null : targetDate.getUTCMonth() + 1,
    day: precision === "DAY" ? targetDate.getUTCDate() : null,
  };
}

function serializeUpdateCuration(preference: AlmanacUpdatePreference | null) {
  return {
    hidden: preference?.hiddenAt !== null && preference?.hiddenAt !== undefined,
    significance: preference?.significance ?? AlmanacUpdateSignificance.STANDARD,
    targetDate: serializeTargetDate(
      preference?.targetDate ?? null,
      preference?.targetDatePrecision ?? null,
    ),
  };
}

// Directional eligibility only. The client must still name the exact earlier
// Update in an explicit accepted decision; the service never chooses a target.
const SUPERSEDED_STATES_BY_INCOMING_STATE: Record<
  AlmanacUpdateStateValue,
  readonly AlmanacUpdateStateValue[]
> = {
  NOW: ["NOW", "NEXT", "OPEN"],
  NEXT: ["NEXT", "OPEN"],
  OPEN: ["OPEN"],
  DONE: ["NOW", "NEXT", "OPEN", "DONE"],
};

export function canSupersedeAlmanacUpdateState(
  incomingState: AlmanacUpdateStateValue,
  earlierState: AlmanacUpdateStateValue,
): boolean {
  return SUPERSEDED_STATES_BY_INCOMING_STATE[incomingState].includes(earlierState);
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

function importRequestReceipt(input: CommitAlmanacImportRequest): AlmanacImportRequestReceipt {
  return {
    version: 1,
    decisions: input.decisions
      .map((decision) => ({
        lineNumber: decision.lineNumber,
        accepted: decision.accepted,
        placeId: decision.placeId ?? null,
        supersedesUpdateId: decision.supersedesUpdateId ?? null,
        subjectName: decision.subjectName ?? null,
        state: decision.state ?? null,
        statement: decision.statement ?? null,
      }))
      .sort((left, right) => left.lineNumber - right.lineNumber),
  };
}

function storedImportRequestReceipt(value: Prisma.JsonValue): AlmanacImportRequestReceipt | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const request = value["importRequest"];
  if (typeof request !== "object" || request === null || Array.isArray(request)) return null;
  if (request["version"] !== 1 || !Array.isArray(request["decisions"])) return null;
  return request as unknown as AlmanacImportRequestReceipt;
}

function sameImportRequest(
  storedRawPacket: string,
  storedReceipt: Prisma.JsonValue,
  requested: CommitAlmanacImportRequest,
): boolean {
  const storedRequest = storedImportRequestReceipt(storedReceipt);
  if (!storedRequest) return false;
  const stored = {
    rawPacket: storedRawPacket,
    decisions: storedRequest.decisions,
  };
  const canonicalRequested = importRequestReceipt(requested);
  const incoming = {
    rawPacket: requested.rawPacket,
    decisions: canonicalRequested.decisions,
  };
  return JSON.stringify(canonicalJson(stored)) === JSON.stringify(canonicalJson(incoming));
}

function nextCompatibilitySlot(places: readonly Pick<AlmanacPlace, "slot">[]): number {
  return places.reduce((highest, place) => Math.max(highest, place.slot), -1) + 1;
}

async function validateSupersession(
  transaction: Transaction,
  userId: string,
  placeId: string,
  state: AlmanacUpdateStateValue,
  targetId: string,
): Promise<AlmanacUpdate> {
  const target = await transaction.almanacUpdate.findFirst({
    where: { id: targetId, userId },
    include: {
      import: { select: { undoneAt: true } },
      visibilityPreference: { select: { hiddenAt: true } },
      supersededBy: {
        where: { import: { undoneAt: null } },
        select: { id: true },
      },
    },
  });
  if (!target) throw new AlmanacNotFoundError("Superseded Update not found.");
  if (target.import.undoneAt) {
    throw new AlmanacConflictError("An Update from an undone Import cannot be superseded.");
  }
  if (target.visibilityPreference?.hiddenAt) {
    throw new AlmanacConflictError("Restore the hidden Update before superseding it.");
  }
  const [incomingSubjectId, targetSubjectId] = await Promise.all([
    presentedSubjectIdForPlace(transaction, userId, placeId),
    presentedSubjectIdForPlace(transaction, userId, target.placeId),
  ]);
  const samePresentedSubject = incomingSubjectId === targetSubjectId;
  if (
    !samePresentedSubject ||
    !canSupersedeAlmanacUpdateState(state, target.state)
  ) {
    throw new AlmanacValidationError(
      "Supersession must stay within the same Subject and use a compatible earlier state.",
    );
  }
  const activeSuccessor = await transaction.almanacUpdateSupersession.findFirst({
    where: {
      userId,
      predecessorUpdateId: target.id,
      successor: { import: { undoneAt: null } },
    },
    select: { successorUpdateId: true },
  });
  if (activeSuccessor || target.supersededBy.length > 0) {
    throw new AlmanacConflictError("The selected Update has already been superseded.");
  }

  await ensureSupersessionHistoryAcyclic(transaction, userId, [target.id]);
  return target;
}

async function presentedSubjectIdForPlace(
  transaction: Transaction,
  userId: string,
  placeId: string,
): Promise<string> {
  const preference = await transaction.almanacSubjectPreference.findFirst({
    where: { placeId, userId },
    select: { mergedIntoPlaceId: true },
  });
  return preference?.mergedIntoPlaceId ?? placeId;
}

async function ensureSupersessionHistoryAcyclic(
  transaction: Transaction,
  userId: string,
  startIds: readonly string[],
): Promise<void> {
  const edges = await transaction.almanacUpdateSupersession.findMany({
    where: { userId },
    select: { successorUpdateId: true, predecessorUpdateId: true },
  });
  const legacyEdges = await transaction.almanacUpdate.findMany({
    where: { userId, supersedesUpdateId: { not: null } },
    select: { id: true, supersedesUpdateId: true },
  });
  const predecessorsBySuccessor = new Map<string, string[]>();
  for (const edge of [
    ...edges,
    ...legacyEdges.map((edge) => ({
      successorUpdateId: edge.id,
      predecessorUpdateId: edge.supersedesUpdateId!,
    })),
  ]) {
    const predecessors = predecessorsBySuccessor.get(edge.successorUpdateId) ?? [];
    if (!predecessors.includes(edge.predecessorUpdateId)) {
      predecessors.push(edge.predecessorUpdateId);
    }
    predecessorsBySuccessor.set(edge.successorUpdateId, predecessors);
  }
  const state = new Map<string, "visiting" | "visited">();
  const visit = (updateId: string): void => {
    if (state.get(updateId) === "visiting") {
      throw new AlmanacConflictError("Supersession cycle detected.");
    }
    if (state.get(updateId) === "visited") return;
    state.set(updateId, "visiting");
    for (const predecessorId of predecessorsBySuccessor.get(updateId) ?? []) {
      visit(predecessorId);
    }
    state.set(updateId, "visited");
  };
  for (const startId of startIds) visit(startId);
}

async function hasCurrentDuplicate(
  transaction: Transaction,
  userId: string,
  placeId: string,
  fingerprint: string,
  excludedUpdateIds: readonly string[] = [],
): Promise<boolean> {
  const presentedSubjectId = await presentedSubjectIdForPlace(
    transaction,
    userId,
    placeId,
  );
  const memberPreferences = await transaction.almanacSubjectPreference.findMany({
    where: {
      userId,
      OR: [
        { placeId: presentedSubjectId },
        { mergedIntoPlaceId: presentedSubjectId },
      ],
    },
    select: { placeId: true },
  });
  const memberPlaceIds = [...new Set([
    presentedSubjectId,
    ...memberPreferences.map((preference) => preference.placeId),
  ])];
  const candidates = await transaction.almanacUpdate.findMany({
    where: {
      userId,
      placeId: { in: memberPlaceIds },
      normalisedFingerprint: fingerprint,
      ...(excludedUpdateIds.length ? { id: { notIn: [...excludedUpdateIds] } } : {}),
      import: { undoneAt: null },
      OR: [
        { visibilityPreference: { is: null } },
        { visibilityPreference: { is: { hiddenAt: null } } },
      ],
    },
    select: { id: true },
  });
  if (!candidates.length) return false;
  const activeSuccessors = await transaction.almanacUpdateSupersession.findMany({
    where: {
      userId,
      predecessorUpdateId: { in: candidates.map((candidate) => candidate.id) },
      successor: { import: { undoneAt: null } },
    },
    select: { predecessorUpdateId: true },
  });
  const superseded = new Set(
    activeSuccessors.map((successor) => successor.predecessorUpdateId),
  );
  const legacyActiveSuccessors = await transaction.almanacUpdate.findMany({
    where: {
      userId,
      supersedesUpdateId: { in: candidates.map((candidate) => candidate.id) },
      import: { undoneAt: null },
    },
    select: { supersedesUpdateId: true },
  });
  for (const successor of legacyActiveSuccessors) {
    if (successor.supersedesUpdateId) superseded.add(successor.supersedesUpdateId);
  }
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
    originKind: originKindForImport(imported),
    rawPacket: imported.rawPacket,
    receipt: receiptFrom(imported.receipt),
    createdAt: imported.createdAt.toISOString(),
    undoneAt: imported.undoneAt?.toISOString() ?? null,
    updateIds: imported.updates.map((update) => update.id),
  };
}

function serializeUpdate(update: StoredUpdate) {
  const supersedesUpdateIds = update.supersedesEdges
    .map((edge) => edge.predecessorUpdateId)
    .sort();
  if (!supersedesUpdateIds.length && update.supersedesUpdateId) {
    supersedesUpdateIds.push(update.supersedesUpdateId);
  }
  const supersededByUpdateIds = [...new Set([
    ...update.supersededByEdges
      .filter((edge) => edge.successor.import.undoneAt === null)
      .map((edge) => edge.successorUpdateId),
    ...update.supersededBy
      .filter((successor) => successor.import.undoneAt === null)
      .map((successor) => successor.id),
  ])].sort();
  const active = update.import.undoneAt === null;
  return {
    id: update.id,
    placeId: update.placeId,
    importId: update.importId,
    state: update.state,
    statement: update.text,
    sourceLineNumber: update.sourceLineNumber,
    supersedesUpdateId: update.supersedesUpdateId,
    supersedesUpdateIds,
    supersededByUpdateId: supersededByUpdateIds[0] ?? null,
    supersededByUpdateIds,
    originKind: originKindForImport(update.import),
    curation: serializeUpdateCuration(update.visibilityPreference),
    createdAt: update.createdAt.toISOString(),
    active,
    current: active && supersededByUpdateIds.length === 0,
  };
}

function serializeUpdatePreference(preference: AlmanacUpdatePreference) {
  return {
    updateId: preference.updateId,
    hiddenAt: preference.hiddenAt?.toISOString() ?? null,
    significance: preference.significance,
    targetDate: serializeTargetDate(
      preference.targetDate,
      preference.targetDatePrecision,
    ),
    updatedAt: preference.updatedAt.toISOString(),
  };
}

function serializeSubjectPreference(preference: {
  placeId: string;
  displayName: string | null;
  iconKey: string | null;
  archivedAt: Date | null;
  mergedIntoPlaceId: string | null;
  updatedAt: Date;
}) {
  return {
    placeId: preference.placeId,
    displayName: preference.displayName,
    iconKey: preference.iconKey,
    archivedAt: preference.archivedAt?.toISOString() ?? null,
    mergedIntoPlaceId: preference.mergedIntoPlaceId,
    updatedAt: preference.updatedAt.toISOString(),
  };
}

async function loadProjection(
  transaction: Transaction,
  userId: string,
  hooks: AlmanacLoadTestHooks = {},
) {
  const places = await transaction.almanacPlace.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  await hooks.afterPlacesLoaded?.();
  const [updates, imports, subjectPreferences, updatePreferences] = await Promise.all([
    transaction.almanacUpdate.findMany({
      where: { userId },
      include: STORED_UPDATE_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    transaction.almanacImport.findMany({
      where: { userId },
      include: { updates: { select: { id: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    transaction.almanacSubjectPreference.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { placeId: "asc" }],
    }),
    transaction.almanacUpdatePreference.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { updateId: "asc" }],
    }),
  ]);
  const activePlaceIds = new Set<string>();
  for (const update of updates) {
    if (update.import.undoneAt === null) activePlaceIds.add(update.placeId);
  }
  const mergedIntoByPlace = new Map(
    subjectPreferences.map((preference) => [preference.placeId, preference.mergedIntoPlaceId]),
  );
  const activeKeySubjectIds = new Set(
    updates
      .filter((update) => {
        const serialized = serializeUpdate(update);
        return (
          serialized.current &&
          !serialized.curation.hidden &&
          serialized.curation.significance === AlmanacUpdateSignificance.KEY
        );
      })
      .map((update) => mergedIntoByPlace.get(update.placeId) ?? update.placeId),
  );
  return {
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      normalisedName: place.normalisedName,
      slot: place.slot,
      createdAt: place.createdAt.toISOString(),
      active: activePlaceIds.has(place.id),
      hasActiveKeyUpdate: activeKeySubjectIds.has(place.id),
    })),
    updates: updates.map((update) => serializeUpdate(update)),
    imports: imports.map((imported) => serializeImport(imported as StoredImport)),
    subjectPreferences: subjectPreferences.map(serializeSubjectPreference),
    updatePreferences: updatePreferences.map(serializeUpdatePreference),
  };
}

export async function loadAlmanacAtlas(
  userId: string,
  hooks: AlmanacLoadTestHooks = {},
) {
  return prisma.$transaction(
    (transaction) => loadProjection(transaction, userId, hooks),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function loadAlmanacPlace(userId: string, placeId: string) {
  const place = await prisma.almanacPlace.findFirst({
    where: { id: placeId, userId },
    include: {
      updates: {
        include: STORED_UPDATE_INCLUDE,
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
      return {
        ...serializeUpdate(update),
        import: {
          id: update.import.id,
          protocolVersion: update.import.protocolVersion,
          scope: update.import.scope.toLowerCase(),
          originKind: originKindForImport(update.import),
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
    include: {
      updates: {
        include: STORED_UPDATE_INCLUDE,
        orderBy: { sourceLineNumber: "asc" },
      },
    },
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
    await lockAlmanacOwner(transaction, userId);
    const prior = await transaction.almanacImport.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: { updates: true },
    });
    if (prior) {
      if (
        prior.protocolVersion !== ALMANAC_PROTOCOL_VERSION ||
        prior.scope !== scopeToDatabase(packetScope) ||
        !sameImportRequest(prior.rawPacket, prior.receipt, input)
      ) {
        throw new AlmanacConflictError(
          "The idempotency key was already used for another Almanac Import request.",
        );
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
    const writablePlaceIds = new Set<string>();
    const pendingSupersessionTargets = new Set<string>();

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
              slot: nextCompatibilitySlot(allPlaces),
            },
          });
          allPlaces.push(place);
          placeByNormalisedName.set(normalisedName, place);
          placeById.set(place.id, place);
          newPlaces += 1;
        }
      }

      if (!writablePlaceIds.has(place.id)) {
        await requireWritablePresentedSubject(transaction, userId, place.id);
        writablePlaceIds.add(place.id);
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
        if (pendingSupersessionTargets.has(supersedesUpdateId)) {
          throw new AlmanacValidationError(
            "One earlier Update cannot be superseded more than once in the same Import.",
          );
        }
        await validateSupersession(
          transaction,
          userId,
          place.id,
          effectiveParsed.state,
          supersedesUpdateId,
        );
        pendingSupersessionTargets.add(supersedesUpdateId);
      }
      accepted.push({ parsed: effectiveParsed, place, supersedesUpdateId, fingerprint });
    }

    if (!accepted.length) {
      throw new AlmanacValidationError("The Import contains no accepted, non-duplicate Updates.");
    }
    await hooks.afterPlacesResolved?.();

    const receipt: AlmanacReceipt = {
      version: 1,
      importRequest: importRequestReceipt(input),
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
    const legacyEdges = persistedImport.updates.flatMap((update) =>
      update.supersedesUpdateId
        ? [{
            successorUpdateId: update.id,
            predecessorUpdateId: update.supersedesUpdateId,
            userId,
          }]
        : [],
    );
    if (legacyEdges.length) {
      await transaction.almanacUpdateSupersession.createMany({ data: legacyEdges });
    }
    return { disposition: "created" as const, import: serializeImport(persistedImport), atlas: await loadProjection(transaction, userId) };
  });
}

export async function undoAlmanacImport(userId: string, importId: string) {
  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    const imported = await transaction.almanacImport.findFirst({
      where: { id: importId, userId },
      include: { updates: true },
    });
    if (!imported) throw new AlmanacNotFoundError("Import not found.");
    if (imported.undoneAt) {
      return { disposition: "already_undone" as const, import: serializeImport(imported), atlas: await loadProjection(transaction, userId) };
    }

    const updateIds = imported.updates.map((update) => update.id);
    const activeLaterSuccessor = await transaction.almanacUpdateSupersession.findFirst({
      where: {
        userId,
        predecessorUpdateId: { in: updateIds },
        successor: { import: { undoneAt: null, id: { not: importId } } },
      },
      select: { successorUpdateId: true },
    });
    const legacyActiveLaterSuccessor = await transaction.almanacUpdate.findFirst({
      where: {
        userId,
        supersedesUpdateId: { in: updateIds },
        import: { undoneAt: null, id: { not: importId } },
      },
      select: { id: true },
    });
    if (activeLaterSuccessor || legacyActiveLaterSuccessor) {
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

async function requireOwnerPlace(
  transaction: Transaction,
  userId: string,
  placeId: string,
): Promise<AlmanacPlace> {
  const place = await transaction.almanacPlace.findFirst({ where: { id: placeId, userId } });
  if (!place) throw new AlmanacNotFoundError("Subject not found.");
  return place;
}

async function requireWritablePresentedSubject(
  transaction: Transaction,
  userId: string,
  placeId: string,
): Promise<void> {
  const preference = await transaction.almanacSubjectPreference.findFirst({
    where: { placeId, userId },
    select: { archivedAt: true, mergedIntoPlaceId: true },
  });
  if (preference?.mergedIntoPlaceId) {
    throw new AlmanacConflictError("Add the Update to the visible combined Subject.");
  }
  if (preference?.archivedAt) {
    throw new AlmanacConflictError("Restore this Subject before adding an Update.");
  }
}

function directRequestReceipt(
  subjectId: string,
  input: CreateDirectAlmanacSubjectUpdateRequest,
): DirectRequestReceipt {
  return {
    subjectId,
    action: input.action,
    state: input.state,
    statement: input.statement,
    supersedesUpdateIds: [...input.supersedesUpdateIds].sort(),
    curation: {
      significance: input.curation?.significance ?? "STANDARD",
      targetDate: canonicalTargetDate(input.curation?.targetDate),
    },
  };
}

function directReceiptFrom(value: Prisma.JsonValue): AlmanacDirectReceipt | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const directRequest = value["directRequest"];
  if (typeof directRequest !== "object" || directRequest === null || Array.isArray(directRequest)) {
    return null;
  }
  return value as unknown as AlmanacDirectReceipt;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function sameDirectRequest(
  stored: DirectRequestReceipt,
  requested: DirectRequestReceipt,
): boolean {
  return JSON.stringify(canonicalJson(stored)) === JSON.stringify(canonicalJson(requested));
}

function validateDirectRequestDefensively(
  input: CreateDirectAlmanacSubjectUpdateRequest,
): void {
  const uniqueTargets = new Set(input.supersedesUpdateIds);
  if (
    !input.statement.trim() ||
    /[\r\n]/u.test(input.statement) ||
    input.statement.length > ALMANAC_UPDATE_TEXT_MAX_LENGTH
  ) {
    throw new AlmanacValidationError("Direct Update wording must be one non-empty source line.");
  }
  if (uniqueTargets.size !== input.supersedesUpdateIds.length) {
    throw new AlmanacValidationError("Choose each earlier Update only once.");
  }
  if (input.action === "resolution" && input.supersedesUpdateIds.length < 2) {
    throw new AlmanacValidationError("A resolution must replace at least two selected Updates.");
  }
  if (input.action !== "resolution" && input.supersedesUpdateIds.length !== 1) {
    throw new AlmanacValidationError("A correction or outcome must replace exactly one Update.");
  }
  if (input.action === "outcome" && input.state === "OPEN") {
    throw new AlmanacValidationError("An open-question outcome must be NOW, NEXT or DONE.");
  }
  if (input.curation?.targetDate && input.state !== "NEXT") {
    throw new AlmanacValidationError("Only a NEXT Update can have a target date.");
  }
}

export async function createDirectAlmanacSubjectUpdate(
  userId: string,
  placeId: string,
  input: CreateDirectAlmanacSubjectUpdateRequest,
  hooks: AlmanacDirectUpdateTestHooks = {},
) {
  validateDirectRequestDefensively(input);
  const requestReceipt = directRequestReceipt(placeId, input);
  const rawPacket = [
    ALMANAC_USER_PROTOCOL_VERSION,
    `action: ${input.action}`,
    input.statement,
  ].join("\n");

  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    const prior = await transaction.almanacImport.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: { updates: true },
    });
    if (prior) {
      const priorReceipt = directReceiptFrom(prior.receipt);
      if (
        prior.scope !== AlmanacImportScope.DIRECT ||
        prior.protocolVersion !== ALMANAC_USER_PROTOCOL_VERSION ||
        prior.rawPacket !== rawPacket ||
        !priorReceipt ||
        !sameDirectRequest(priorReceipt.directRequest, requestReceipt) ||
        prior.updates.length !== 1
      ) {
        throw new AlmanacConflictError(
          "The idempotency key was already used for another Almanac change.",
        );
      }
      const atlas = await loadProjection(transaction, userId);
      const projected = atlas.updates.find((update) => update.id === prior.updates[0]!.id);
      if (!projected) throw new AlmanacConflictError("The direct Update projection is missing.");
      return {
        disposition: "idempotent_retry" as const,
        importId: prior.id,
        updateId: projected.id,
        scope: "direct" as const,
        originKind: "USER_ENTRY" as const,
        supersedesUpdateIds: projected.supersedesUpdateIds,
        curation: projected.curation,
        atlas,
      };
    }

    await requireOwnerPlace(transaction, userId, placeId);
    await requireWritablePresentedSubject(transaction, userId, placeId);

    const targets = await transaction.almanacUpdate.findMany({
      where: { userId, id: { in: input.supersedesUpdateIds } },
      include: STORED_UPDATE_INCLUDE,
    });
    if (targets.length !== input.supersedesUpdateIds.length) {
      throw new AlmanacNotFoundError("One or more selected Updates were not found.");
    }

    const targetPlaceIds = [...new Set(targets.map((target) => target.placeId))];
    const targetPreferences = await transaction.almanacSubjectPreference.findMany({
      where: { userId, placeId: { in: targetPlaceIds } },
      select: { placeId: true, mergedIntoPlaceId: true },
    });
    const presentedSubjectByPlace = new Map(
      targetPreferences.map((preference) => [
        preference.placeId,
        preference.mergedIntoPlaceId ?? preference.placeId,
      ]),
    );

    for (const target of targets) {
      const targetPresentedSubjectId =
        presentedSubjectByPlace.get(target.placeId) ?? target.placeId;
      if (targetPresentedSubjectId !== placeId) {
        throw new AlmanacValidationError(
          "Every selected Update must belong to the same Subject.",
        );
      }
      if (target.import.undoneAt) {
        throw new AlmanacConflictError("An Update from an undone source cannot be replaced.");
      }
      if (target.visibilityPreference?.hiddenAt) {
        throw new AlmanacConflictError("Restore hidden Updates before replacing them.");
      }
      if (
        target.supersededByEdges.some((edge) => edge.successor.import.undoneAt === null) ||
        target.supersededBy.some((successor) => successor.import.undoneAt === null)
      ) {
        throw new AlmanacConflictError("A selected Update has already been superseded.");
      }
      if (!canSupersedeAlmanacUpdateState(input.state, target.state)) {
        throw new AlmanacValidationError(
          "Every selected Update must use a compatible earlier state.",
        );
      }
    }
    if (input.action === "resolution") {
      const targetStates = new Set(targets.map((target) => target.state));
      const targetState = targets[0]?.state;
      if (
        targetStates.size !== 1 ||
        (targetState !== AlmanacUpdateState.NOW && targetState !== AlmanacUpdateState.NEXT)
      ) {
        throw new AlmanacValidationError(
          "A resolution must replace current Updates with the same NOW or NEXT state.",
        );
      }
    }
    if (input.action === "outcome" && targets[0]?.state !== AlmanacUpdateState.OPEN) {
      throw new AlmanacValidationError("An outcome must replace one current OPEN Update.");
    }
    const incomingFingerprint = almanacUpdateFingerprint(input.state, input.statement);
    if (
      input.action !== "resolution" &&
      targets.some((target) => target.normalisedFingerprint === incomingFingerprint)
    ) {
      throw new AlmanacConflictError("The replacement is identical to the current Update.");
    }
    if (
      await hasCurrentDuplicate(
        transaction,
        userId,
        placeId,
        incomingFingerprint,
        input.supersedesUpdateIds,
      )
    ) {
      throw new AlmanacConflictError("An identical current Update already exists.");
    }
    await ensureSupersessionHistoryAcyclic(
      transaction,
      userId,
      targets.map((target) => target.id),
    );
    await hooks.afterTargetsValidated?.();

    const receipt: AlmanacDirectReceipt = {
      version: 1,
      directRequest: requestReceipt,
      lines: [{ lineNumber: 3, outcome: "accepted", reason: `user_${input.action}` }],
      counts: {
        accepted: 1,
        rejected: 0,
        newPlaces: 0,
        duplicates: 0,
        invalid: 0,
      },
    };
    const imported = await transaction.almanacImport.create({
      data: {
        userId,
        idempotencyKey: input.idempotencyKey,
        protocolVersion: ALMANAC_USER_PROTOCOL_VERSION,
        scope: AlmanacImportScope.DIRECT,
        rawPacket,
        receipt: receipt as unknown as Prisma.InputJsonValue,
      },
    });
    const legacySupersedesUpdateId =
      requestReceipt.supersedesUpdateIds.length === 1
        ? requestReceipt.supersedesUpdateIds[0]!
        : null;
    const update = await transaction.almanacUpdate.create({
      data: {
        userId,
        importId: imported.id,
        placeId,
        state: stateToDatabase(input.state),
        text: input.statement,
        normalisedFingerprint: incomingFingerprint,
        sourceLineNumber: 3,
        supersedesUpdateId: legacySupersedesUpdateId,
      },
    });
    await transaction.almanacUpdateSupersession.createMany({
      data: requestReceipt.supersedesUpdateIds.map((predecessorUpdateId) => ({
        userId,
        successorUpdateId: update.id,
        predecessorUpdateId,
      })),
    });
    const targetDate = requestReceipt.curation.targetDate;
    await transaction.almanacUpdatePreference.create({
      data: {
        updateId: update.id,
        userId,
        significance: AlmanacUpdateSignificance[requestReceipt.curation.significance],
        targetDate: targetDate ? targetDateToDatabase(targetDate) : null,
        targetDatePrecision: targetDate
          ? AlmanacTargetDatePrecision[targetDate.precision]
          : null,
      },
    });

    const atlas = await loadProjection(transaction, userId);
    const projected = atlas.updates.find((candidate) => candidate.id === update.id);
    if (!projected) throw new AlmanacConflictError("The direct Update projection is missing.");
    return {
      disposition: "created" as const,
      importId: imported.id,
      updateId: update.id,
      scope: "direct" as const,
      originKind: "USER_ENTRY" as const,
      supersedesUpdateIds: projected.supersedesUpdateIds,
      curation: projected.curation,
      atlas,
    };
  });
}

export async function updateAlmanacSubject(
  userId: string,
  placeId: string,
  input: UpdateAlmanacSubjectRequest,
) {
  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    await requireOwnerPlace(transaction, userId, placeId);
    const existing = await transaction.almanacSubjectPreference.findUnique({ where: { placeId } });
    if (existing?.mergedIntoPlaceId) {
      throw new AlmanacConflictError("Organise the combined Subject instead.");
    }
    await transaction.almanacSubjectPreference.upsert({
      where: { placeId },
      create: {
        placeId,
        userId,
        displayName: input.displayName ?? null,
        iconKey: input.iconKey ?? null,
        archivedAt: input.archived ? new Date() : null,
      },
      update: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      },
    });
    return { atlas: await loadProjection(transaction, userId) };
  });
}

export async function mergeAlmanacSubjects(
  userId: string,
  input: MergeAlmanacSubjectsRequest,
) {
  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    await Promise.all([
      requireOwnerPlace(transaction, userId, input.sourceSubjectId),
      requireOwnerPlace(transaction, userId, input.targetSubjectId),
    ]);
    const preferences = await transaction.almanacSubjectPreference.findMany({
      where: { userId, placeId: { in: [input.sourceSubjectId, input.targetSubjectId] } },
    });
    const byPlace = new Map(preferences.map((preference) => [preference.placeId, preference]));
    if (byPlace.get(input.sourceSubjectId)?.mergedIntoPlaceId) {
      throw new AlmanacConflictError("The source Subject is already combined.");
    }
    if (byPlace.get(input.targetSubjectId)?.mergedIntoPlaceId) {
      throw new AlmanacConflictError("Choose the visible combined Subject as the destination.");
    }
    const sourceHasMembers = await transaction.almanacSubjectPreference.count({
      where: { userId, mergedIntoPlaceId: input.sourceSubjectId },
    });
    if (sourceHasMembers > 0) {
      throw new AlmanacConflictError("Separate this combined Subject before combining it again.");
    }

    await transaction.almanacSubjectPreference.upsert({
      where: { placeId: input.targetSubjectId },
      create: { placeId: input.targetSubjectId, userId, displayName: input.displayName },
      update: { displayName: input.displayName, archivedAt: null },
    });
    await transaction.almanacSubjectPreference.upsert({
      where: { placeId: input.sourceSubjectId },
      create: {
        placeId: input.sourceSubjectId,
        userId,
        mergedIntoPlaceId: input.targetSubjectId,
      },
      update: { mergedIntoPlaceId: input.targetSubjectId, archivedAt: null },
    });
    return { atlas: await loadProjection(transaction, userId) };
  });
}

export async function unmergeAlmanacSubject(userId: string, placeId: string) {
  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    await requireOwnerPlace(transaction, userId, placeId);
    const existing = await transaction.almanacSubjectPreference.findUnique({ where: { placeId } });
    if (!existing?.mergedIntoPlaceId) {
      throw new AlmanacConflictError("This Subject is not combined.");
    }
    const activeCrossPlaceEdge = await transaction.almanacUpdateSupersession.findFirst({
      where: {
        userId,
        successor: { import: { undoneAt: null } },
        OR: [
          {
            predecessor: { placeId },
            successor: { placeId: { not: placeId } },
          },
          {
            successor: { placeId },
            predecessor: { placeId: { not: placeId } },
          },
        ],
      },
      select: { successorUpdateId: true },
    });
    const activeLegacyCrossPlaceEdge = await transaction.almanacUpdate.findFirst({
      where: {
        userId,
        supersedesUpdateId: { not: null },
        import: { undoneAt: null },
        OR: [
          {
            placeId: { not: placeId },
            supersedesUpdate: { placeId },
          },
          {
            placeId,
            supersedesUpdate: { placeId: { not: placeId } },
          },
        ],
      },
      select: { id: true },
    });
    if (activeCrossPlaceEdge || activeLegacyCrossPlaceEdge) {
      throw new AlmanacConflictError(
        "Undo the active repair that joins these Subjects before separating them.",
      );
    }
    await transaction.almanacSubjectPreference.update({
      where: { placeId },
      data: { mergedIntoPlaceId: null },
    });
    return { atlas: await loadProjection(transaction, userId) };
  });
}

export async function updateAlmanacUpdatePreference(
  userId: string,
  updateId: string,
  input: UpdateAlmanacUpdatePreferenceRequest,
) {
  return runSerializable(async (transaction) => {
    await lockAlmanacOwner(transaction, userId);
    const update = await transaction.almanacUpdate.findFirst({ where: { id: updateId, userId } });
    if (!update) throw new AlmanacNotFoundError("Update not found.");
    if (input.targetDate && update.state !== AlmanacUpdateState.NEXT) {
      throw new AlmanacValidationError("Only a NEXT Update can have a target date.");
    }
    const targetDate =
      input.targetDate === undefined ? undefined : canonicalTargetDate(input.targetDate);
    const now = new Date();
    await transaction.almanacUpdatePreference.upsert({
      where: { updateId },
      create: {
        updateId,
        userId,
        hiddenAt: input.hidden ? now : null,
        significance: input.significance ?? AlmanacUpdateSignificance.STANDARD,
        targetDate: targetDate ? targetDateToDatabase(targetDate) : null,
        targetDatePrecision: targetDate
          ? AlmanacTargetDatePrecision[targetDate.precision]
          : null,
      },
      update: {
        ...(input.hidden !== undefined ? { hiddenAt: input.hidden ? now : null } : {}),
        ...(input.significance !== undefined
          ? { significance: AlmanacUpdateSignificance[input.significance] }
          : {}),
        ...(targetDate !== undefined
          ? {
              targetDate: targetDate ? targetDateToDatabase(targetDate) : null,
              targetDatePrecision: targetDate
                ? AlmanacTargetDatePrecision[targetDate.precision]
                : null,
            }
          : {}),
      },
    });
    const atlas = await loadProjection(transaction, userId);
    const projected = atlas.updates.find((candidate) => candidate.id === updateId);
    if (!projected) throw new AlmanacConflictError("The curated Update projection is missing.");
    return { updateId, curation: projected.curation, atlas };
  });
}
