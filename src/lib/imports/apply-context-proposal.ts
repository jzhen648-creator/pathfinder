import {
  ChapterRevisionKind,
  ImportProposalStatus,
  ImportSourceState,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeObservationStatus,
  Prisma,
  SourceSupportType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ImportProposalApplicationConflictError,
  ImportProposalApplicationNotFoundError,
} from "@/lib/imports/apply-possibility-proposal";
import { refreshImportSourceState } from "@/lib/imports/source-state";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";

type TransactionClient = Prisma.TransactionClient;
const TRANSACTION_ATTEMPTS = 3;

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

export function appendConfirmedContext(current: string | null, addition: string): string {
  const existing = current?.trim() ?? "";
  const next = addition.trim();
  if (!existing) return next;
  if (existing.toLocaleLowerCase().includes(next.toLocaleLowerCase())) return existing;
  return `${existing}\n\n${next}`;
}

export type ContextProposalPlanInput = {
  status: ImportProposalStatus;
  memoryDestination: LifeMemoryDestination;
  evidenceCount: number;
  hasActiveChapterTarget: boolean;
};

export function planContextProposalApplication(input: ContextProposalPlanInput) {
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
  if (input.memoryDestination === LifeMemoryDestination.BACKGROUND) {
    return { action: "create_background" as const };
  }
  if (input.memoryDestination === LifeMemoryDestination.CHAPTER) {
    if (!input.hasActiveChapterTarget) {
      throw new ImportProposalApplicationConflictError("MISSING_TARGET");
    }
    return { action: "update_chapter" as const };
  }
  throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
}

function revisionKind(
  informationType: LifeObservationKind,
  effectiveFrom: Date | null,
): ChapterRevisionKind {
  if (informationType === LifeObservationKind.DECISION) return ChapterRevisionKind.DECISION;
  if (informationType === LifeObservationKind.COMMITMENT) return ChapterRevisionKind.COMMITMENT;
  if (informationType === LifeObservationKind.TENSION) return ChapterRevisionKind.TENSION;
  if (effectiveFrom) return ChapterRevisionKind.TIMING;
  return ChapterRevisionKind.UPDATED;
}

function stateBackground(value: Prisma.JsonValue | null): string | null | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const background = (value as Record<string, unknown>).background;
  return typeof background === "string" ? background : background === null ? null : undefined;
}

const CONTEXT_PROPOSAL_INCLUDE = {
  source: { select: { capturedAt: true, createdAt: true } },
  targetGoal: {
    select: { id: true, userId: true, title: true, background: true, archived: true },
  },
  exactEvidence: {
    select: { role: true, evidenceSpanId: true },
  },
  application: {
    include: {
      resultObservation: { select: { id: true, userId: true, status: true } },
    },
  },
  chapterRevision: {
    select: { id: true, goalId: true, beforeState: true, afterState: true },
  },
} satisfies Prisma.ImportProposalInclude;

export type ApplyContextProposalResult = {
  status: "applied" | "already_applied";
  proposalId: string;
  observationId: string;
  chapterId: string | null;
  sourceState: ImportSourceState;
};

export async function applyContextProposalInTransaction(
  transaction: TransactionClient,
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyContextProposalResult> {
  const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: CONTEXT_PROPOSAL_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();

    if (proposal.application && proposal.application.revertedAt === null) {
      if (
        !proposal.application.resultObservationId ||
        proposal.status !== ImportProposalStatus.ACCEPTED
      ) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      return {
        status: "already_applied" as const,
        proposalId: proposal.id,
        observationId: proposal.application.resultObservationId,
        chapterId: proposal.targetGoalId,
        sourceState: (
          await transaction.importSource.findUniqueOrThrow({
            where: { id: sourceId },
            select: { state: true },
          })
        ).state,
      };
    }

    const plan = planContextProposalApplication({
      status: proposal.status,
      memoryDestination: proposal.memoryDestination,
      evidenceCount: proposal.exactEvidence.length,
      hasActiveChapterTarget: Boolean(proposal.targetGoal && !proposal.targetGoal.archived),
    });
    const isBackground = plan.action === "create_background";
    const isChapter = plan.action === "update_chapter";
    if (proposal.targetGoal && proposal.targetGoal.userId !== userId) {
      throw new ImportProposalApplicationNotFoundError();
    }

    if (proposal.application?.revertedAt) {
      const resultObservation = proposal.application.resultObservation;
      if (
        !resultObservation ||
        resultObservation.userId !== userId ||
        resultObservation.status !== LifeObservationStatus.DISMISSED
      ) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      if (isChapter) {
        const revision = proposal.chapterRevision;
        const goal = proposal.targetGoal;
        if (!revision || !goal || revision.goalId !== goal.id) {
          throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
        }
        const beforeBackground = stateBackground(revision.beforeState);
        const afterBackground = stateBackground(revision.afterState);
        if (beforeBackground === undefined || afterBackground === undefined) {
          throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
        }
        if ((goal.background ?? null) !== beforeBackground) {
          throw new ImportProposalApplicationConflictError("STALE_TARGET");
        }
        await transaction.goal.update({
          where: { id: goal.id },
          data: { background: afterBackground },
        });
      }
      await transaction.lifeObservation.update({
        where: { id: resultObservation.id },
        data: {
          status: LifeObservationStatus.ACTIVE,
          lastConfirmedAt: now,
          confirmedAt: now,
        },
      });
      await transaction.importProposalApplication.update({
        where: { id: proposal.application.id },
        data: { appliedAt: now, revertedAt: null },
      });
      await transaction.importProposal.update({
        where: { id: proposal.id },
        data: {
          status: ImportProposalStatus.ACCEPTED,
          reviewedAt: now,
          observationId: resultObservation.id,
        },
      });
      return {
        status: "applied" as const,
        proposalId: proposal.id,
        observationId: resultObservation.id,
        chapterId: proposal.targetGoalId,
        sourceState: await refreshImportSourceState(transaction, sourceId),
      };
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

    if (isChapter && proposal.targetGoal) {
      const beforeBackground = proposal.targetGoal.background;
      const afterBackground = appendConfirmedContext(beforeBackground, proposal.proposedText);
      await transaction.chapterObservation.create({
        data: {
          userId,
          goalId: proposal.targetGoal.id,
          observationId: resultObservation.id,
          role: "PRIMARY",
        },
      });
      await transaction.goal.update({
        where: { id: proposal.targetGoal.id },
        data: { background: afterBackground },
      });
      await transaction.chapterRevision.create({
        data: {
          userId,
          goalId: proposal.targetGoal.id,
          proposalId: proposal.id,
          kind: revisionKind(proposal.informationType, proposal.effectiveFrom),
          summary: proposal.proposedText,
          beforeState: { background: beforeBackground },
          afterState: { background: afterBackground },
          occurredAt: proposal.effectiveFrom,
          confirmedAt: now,
          exactEvidence: {
            create: proposal.exactEvidence.map((evidence) => ({
              evidenceSpanId: evidence.evidenceSpanId,
            })),
          },
        },
      });
    }

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
        resultObservationId: resultObservation.id,
        appliedAt: now,
      },
    });

  return {
      status: "applied" as const,
      proposalId: proposal.id,
      observationId: resultObservation.id,
      chapterId: proposal.targetGoalId,
      sourceState: await refreshImportSourceState(transaction, sourceId),
    };
}

export async function applyContextProposal(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyContextProposalResult> {
  const result = await runSerializable((transaction) =>
    applyContextProposalInTransaction(transaction, userId, sourceId, proposalId, now),
  );

  if (result.chapterId && result.status === "applied") {
    try {
      await markPursuitReadingDirty(userId, result.chapterId, "import_proposal_applied", {
        details: { event: "updated", changes: [{ field: "background" }] },
      });
    } catch (error) {
      console.error("[imports] Applied chapter update but could not mark insights dirty", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return result;
}

export type UndoContextProposalResult = {
  status: "undone" | "already_undone";
  proposalId: string;
  chapterId: string | null;
  sourceState: ImportSourceState;
};

export async function undoContextProposalApplication(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<UndoContextProposalResult> {
  const result = await runSerializable(async (transaction) => {
    const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: CONTEXT_PROPOSAL_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();
    const application = proposal.application;
    if (!application || application.revertedAt) {
      return {
        status: "already_undone" as const,
        proposalId: proposal.id,
        chapterId: proposal.targetGoalId,
        sourceState: (
          await transaction.importSource.findUniqueOrThrow({
            where: { id: sourceId },
            select: { state: true },
          })
        ).state,
      };
    }
    const resultObservation = application.resultObservation;
    if (
      proposal.status !== ImportProposalStatus.ACCEPTED ||
      !resultObservation ||
      resultObservation.userId !== userId ||
      resultObservation.status !== LifeObservationStatus.ACTIVE
    ) {
      throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
    }

    if (proposal.memoryDestination === LifeMemoryDestination.CHAPTER) {
      const revision = proposal.chapterRevision;
      const goal = proposal.targetGoal;
      if (!revision || !goal || revision.goalId !== goal.id) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      const beforeBackground = stateBackground(revision.beforeState);
      const afterBackground = stateBackground(revision.afterState);
      if (beforeBackground === undefined || afterBackground === undefined) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      if ((goal.background ?? null) !== afterBackground) {
        throw new ImportProposalApplicationConflictError("STALE_TARGET");
      }
      await transaction.goal.update({
        where: { id: goal.id },
        data: { background: beforeBackground },
      });
    } else if (proposal.memoryDestination !== LifeMemoryDestination.BACKGROUND) {
      throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
    }

    await transaction.lifeObservation.update({
      where: { id: resultObservation.id },
      data: { status: LifeObservationStatus.DISMISSED },
    });
    await transaction.importProposalApplication.update({
      where: { id: application.id },
      data: { revertedAt: now },
    });
    await transaction.importProposal.update({
      where: { id: proposal.id },
      data: { status: ImportProposalStatus.PENDING, reviewedAt: null, observationId: null },
    });
    return {
      status: "undone" as const,
      proposalId: proposal.id,
      chapterId: proposal.targetGoalId,
      sourceState: await refreshImportSourceState(transaction, sourceId),
    };
  });

  if (result.chapterId && result.status === "undone") {
    try {
      await markPursuitReadingDirty(userId, result.chapterId, "import_proposal_undone", {
        details: { event: "updated", changes: [{ field: "background" }] },
      });
    } catch (error) {
      console.error("[imports] Undid chapter update but could not mark insights dirty", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return result;
}
