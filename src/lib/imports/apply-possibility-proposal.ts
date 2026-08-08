import {
  ImportProposalKind,
  ImportProposalStatus,
  ImportSourceState,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeObservationStatus,
  Prisma,
  SourceSupportType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshImportSourceState } from "@/lib/imports/source-state";

const TRANSACTION_ATTEMPTS = 3;

export type PossibilityApplicationConflictCode =
  | "DISMISSED_PROPOSAL"
  | "SUPERSEDED_PROPOSAL"
  | "UNSUPPORTED_PROPOSAL"
  | "MISSING_EVIDENCE"
  | "MISSING_CANONICAL_KEY"
  | "MISSING_CHAPTER_DRAFT"
  | "MISSING_TARGET"
  | "STALE_TARGET"
  | "INCONSISTENT_APPLICATION";

export class ImportProposalApplicationNotFoundError extends Error {
  constructor() {
    super("Import proposal not found");
    this.name = "ImportProposalApplicationNotFoundError";
  }
}

export class ImportProposalApplicationConflictError extends Error {
  readonly code: PossibilityApplicationConflictCode;

  constructor(code: PossibilityApplicationConflictCode) {
    super(code);
    this.name = "ImportProposalApplicationConflictError";
    this.code = code;
  }
}

type PossibilityProposalPolicyInput = {
  status: ImportProposalStatus;
  kind: ImportProposalKind;
  informationType: LifeObservationKind;
  memoryDestination: LifeMemoryDestination;
  canonicalKey: string | null;
  evidenceCount: number;
  target: null | {
    status: LifeObservationStatus;
    memoryDestination: LifeMemoryDestination;
  };
};

export type PossibilityProposalPlan =
  | { action: "create_possibility" }
  | { action: "close_possibility" };

/**
 * Deliberately narrow first apply policy. Other proposal kinds remain pending
 * until their mutation and undo semantics are independently proven.
 */
export function planPossibilityProposalApplication(
  input: PossibilityProposalPolicyInput,
): PossibilityProposalPlan {
  if (input.status === ImportProposalStatus.DISMISSED) {
    throw new ImportProposalApplicationConflictError("DISMISSED_PROPOSAL");
  }
  if (input.status === ImportProposalStatus.SUPERSEDED) {
    throw new ImportProposalApplicationConflictError("SUPERSEDED_PROPOSAL");
  }
  if (input.status === ImportProposalStatus.ACCEPTED) {
    throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
  }
  if (input.evidenceCount < 1) {
    throw new ImportProposalApplicationConflictError("MISSING_EVIDENCE");
  }
  if (!input.canonicalKey?.trim()) {
    throw new ImportProposalApplicationConflictError("MISSING_CANONICAL_KEY");
  }

  const createsPossibility =
    input.kind === ImportProposalKind.NEW_OBSERVATION &&
    input.informationType === LifeObservationKind.POSSIBILITY &&
    input.memoryDestination === LifeMemoryDestination.POSSIBILITY &&
    input.target === null;
  if (createsPossibility) return { action: "create_possibility" };

  const closesPossibility =
    input.kind === ImportProposalKind.UPDATE &&
    input.informationType === LifeObservationKind.DECISION &&
    input.memoryDestination === LifeMemoryDestination.POSSIBILITY;
  if (!closesPossibility) {
    throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
  }
  if (!input.target) {
    throw new ImportProposalApplicationConflictError("MISSING_TARGET");
  }
  if (
    input.target.memoryDestination !== LifeMemoryDestination.POSSIBILITY ||
    input.target.status !== LifeObservationStatus.ACTIVE
  ) {
    throw new ImportProposalApplicationConflictError("STALE_TARGET");
  }
  return { action: "close_possibility" };
}

type TransactionClient = Prisma.TransactionClient;

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function runSerializable<T>(work: (transaction: TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!retryable || attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
  throw new Error("Import proposal transaction retry loop exited unexpectedly");
}

const PROPOSAL_APPLICATION_INCLUDE = {
  source: { select: { capturedAt: true, createdAt: true } },
  observation: {
    select: {
      id: true,
      userId: true,
      status: true,
      memoryDestination: true,
      effectiveTo: true,
    },
  },
  exactEvidence: {
    select: {
      role: true,
      supportType: true,
      evidenceSpanId: true,
    },
  },
  application: {
    include: {
      targetObservation: {
        select: {
          id: true,
          userId: true,
          status: true,
          memoryDestination: true,
          effectiveTo: true,
        },
      },
      resultObservation: { select: { id: true, userId: true, status: true } },
    },
  },
} satisfies Prisma.ImportProposalInclude;

export type ApplyPossibilityProposalResult = {
  status: "applied" | "already_applied";
  proposalId: string;
  observationId: string;
  sourceState: ImportSourceState;
};

export async function applyPossibilityProposalInTransaction(
  transaction: TransactionClient,
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyPossibilityProposalResult> {
  const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: PROPOSAL_APPLICATION_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();

    if (proposal.application && proposal.application.revertedAt === null) {
      const resultObservationId = proposal.application.resultObservationId;
      if (!resultObservationId || proposal.status !== ImportProposalStatus.ACCEPTED) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      return {
        status: "already_applied",
        proposalId: proposal.id,
        observationId: resultObservationId,
        sourceState: (await transaction.importSource.findUniqueOrThrow({
          where: { id: proposal.sourceId },
          select: { state: true },
        })).state,
      };
    }

    if (proposal.application?.revertedAt) {
      const application = proposal.application;
      const result = application.resultObservation;
      if (
        !result ||
        result.userId !== userId ||
        result.status !== LifeObservationStatus.DISMISSED
      ) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      if (application.targetObservation) {
        if (
          application.targetObservation.userId !== userId ||
          application.targetObservation.status !== application.priorTargetStatus
        ) {
          throw new ImportProposalApplicationConflictError("STALE_TARGET");
        }
        await transaction.lifeObservation.update({
          where: { id: application.targetObservation.id },
          data: {
            status: LifeObservationStatus.RESOLVED,
            effectiveTo: proposal.effectiveFrom ?? now,
          },
        });
      }
      await transaction.lifeObservation.update({
        where: { id: result.id },
        data: {
          status: LifeObservationStatus.ACTIVE,
          lastConfirmedAt: now,
          confirmedAt: now,
        },
      });
      await transaction.importProposalApplication.update({
        where: { id: application.id },
        data: { appliedAt: now, revertedAt: null },
      });
      await transaction.importProposal.update({
        where: { id: proposal.id },
        data: {
          status: ImportProposalStatus.ACCEPTED,
          reviewedAt: now,
          observationId: result.id,
        },
      });
      return {
        status: "applied",
        proposalId: proposal.id,
        observationId: result.id,
        sourceState: await refreshImportSourceState(transaction, proposal.sourceId),
      };
    }

    const target = proposal.observation;
    if (target && target.userId !== userId) {
      throw new ImportProposalApplicationNotFoundError();
    }
    const plan = planPossibilityProposalApplication({
      status: proposal.status,
      kind: proposal.kind,
      informationType: proposal.informationType,
      memoryDestination: proposal.memoryDestination,
      canonicalKey: proposal.canonicalKey,
      evidenceCount: proposal.exactEvidence.length,
      target,
    });

    if (plan.action === "close_possibility" && target) {
      await transaction.lifeObservation.update({
        where: { id: target.id },
        data: {
          status: LifeObservationStatus.RESOLVED,
          effectiveTo: proposal.effectiveFrom ?? now,
        },
      });
    }

    const observedAt = proposal.observedAt ?? proposal.source.capturedAt ?? proposal.source.createdAt;
    const resultObservation = await transaction.lifeObservation.create({
      data: {
        userId,
        kind: proposal.informationType,
        status: LifeObservationStatus.ACTIVE,
        subjectType: proposal.subjectType,
        subjectLabel: proposal.subjectLabel,
        memoryDestination: proposal.memoryDestination,
        backgroundCategory: proposal.backgroundCategory,
        temporalState: proposal.temporalState,
        temporalPrecision: proposal.temporalPrecision,
        canonicalKey: proposal.canonicalKey,
        canonicalText: proposal.proposedText,
        supersedesObservationId: target?.id ?? null,
        occurredAt:
          proposal.informationType === LifeObservationKind.EVENT ||
          proposal.informationType === LifeObservationKind.DECISION
            ? proposal.effectiveFrom
            : null,
        effectiveFrom: proposal.effectiveFrom,
        effectiveTo: proposal.effectiveTo,
        firstObservedAt: observedAt,
        lastMentionedAt: observedAt,
        lastConfirmedAt: now,
        confirmedAt: now,
        exactEvidence: {
          create: proposal.exactEvidence.map((evidence) => ({
            evidenceSpanId: evidence.evidenceSpanId,
            role: evidence.role,
            supportType: SourceSupportType.USER_CONFIRMED,
          })),
        },
      },
    });

    await transaction.importProposal.update({
      where: { id: proposal.id },
      data: {
        status: ImportProposalStatus.ACCEPTED,
        reviewedAt: now,
        observationId: resultObservation.id,
      },
    });
    await transaction.importProposalApplication.create({
      data: {
        userId,
        proposalId: proposal.id,
        targetObservationId: target?.id ?? null,
        resultObservationId: resultObservation.id,
        priorTargetStatus: target?.status ?? null,
        priorTargetEffectiveTo: target?.effectiveTo ?? null,
        appliedAt: now,
      },
    });

  return {
      status: "applied",
      proposalId: proposal.id,
      observationId: resultObservation.id,
      sourceState: await refreshImportSourceState(transaction, proposal.sourceId),
    };
}

export async function applyPossibilityProposal(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyPossibilityProposalResult> {
  return runSerializable((transaction) =>
    applyPossibilityProposalInTransaction(transaction, userId, sourceId, proposalId, now),
  );
}

export type UndoPossibilityProposalResult = {
  status: "undone" | "already_undone";
  proposalId: string;
  sourceState: ImportSourceState;
};

export async function undoPossibilityProposalApplication(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<UndoPossibilityProposalResult> {
  return runSerializable(async (transaction) => {
    const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: PROPOSAL_APPLICATION_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();

    const application = proposal.application;
    if (!application || application.revertedAt) {
      return {
        status: "already_undone",
        proposalId: proposal.id,
        sourceState: (await transaction.importSource.findUniqueOrThrow({
          where: { id: proposal.sourceId },
          select: { state: true },
        })).state,
      };
    }
    const result = application.resultObservation;
    if (
      proposal.status !== ImportProposalStatus.ACCEPTED ||
      !result ||
      result.userId !== userId
    ) {
      throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
    }
    if (result.status !== LifeObservationStatus.ACTIVE) {
      throw new ImportProposalApplicationConflictError("STALE_TARGET");
    }

    await transaction.lifeObservation.update({
      where: { id: result.id },
      data: { status: LifeObservationStatus.DISMISSED },
    });
    if (application.targetObservation) {
      if (application.targetObservation.userId !== userId) {
        throw new ImportProposalApplicationNotFoundError();
      }
      await transaction.lifeObservation.update({
        where: { id: application.targetObservation.id },
        data: {
          status: application.priorTargetStatus ?? LifeObservationStatus.ACTIVE,
          effectiveTo: application.priorTargetEffectiveTo,
        },
      });
    }
    await transaction.importProposalApplication.update({
      where: { id: application.id },
      data: { revertedAt: now },
    });
    await transaction.importProposal.update({
      where: { id: proposal.id },
      data: {
        status: ImportProposalStatus.PENDING,
        reviewedAt: null,
        observationId: application.targetObservationId,
      },
    });

    return {
      status: "undone",
      proposalId: proposal.id,
      sourceState: await refreshImportSourceState(transaction, proposal.sourceId),
    };
  });
}
