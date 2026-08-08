import { ImportProposalKind, ImportProposalStatus, Prisma } from "@prisma/client";
import { applyImportProposalInTransaction } from "@/lib/imports/apply-import-proposal";
import {
  parseProposalReviewDecision,
  withoutProposalReviewDecision,
} from "@/lib/imports/proposal-review-decision";
import { refreshImportSourceState } from "@/lib/imports/source-state";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";

const TRANSACTION_ATTEMPTS = 3;

export class LifeUpdateConfirmationNotFoundError extends Error {
  constructor() {
    super("Import source not found");
    this.name = "LifeUpdateConfirmationNotFoundError";
  }
}

export class LifeUpdateConfirmationConflictError extends Error {
  readonly code = "INCOMPLETE_REVIEW" as const;

  constructor(readonly unresolvedProposalIds: string[]) {
    super("INCOMPLETE_REVIEW");
    this.name = "LifeUpdateConfirmationConflictError";
  }
}

type ConfirmationCandidate = {
  id: string;
  status: ImportProposalStatus;
  reviewBucket: "primary" | "overflow";
  reviewDecision: "accept" | null;
};

export function planLifeUpdateConfirmation(proposals: ConfirmationCandidate[]) {
  const unresolvedProposalIds = proposals
    .filter(
      (proposal) =>
        proposal.reviewBucket === "primary" &&
        proposal.status === ImportProposalStatus.PENDING &&
        proposal.reviewDecision !== "accept",
    )
    .map((proposal) => proposal.id);
  if (unresolvedProposalIds.length) {
    throw new LifeUpdateConfirmationConflictError(unresolvedProposalIds);
  }
  return {
    selectedProposalIds: proposals
      .filter(
        (proposal) =>
          proposal.status === ImportProposalStatus.PENDING &&
          proposal.reviewDecision === "accept",
      )
      .map((proposal) => proposal.id),
    hasPreviouslyApplied: proposals.some(
      (proposal) => proposal.status === ImportProposalStatus.ACCEPTED,
    ),
  };
}

function reviewBucket(payload: Prisma.JsonValue | null): "primary" | "overflow" {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return "primary";
  return (payload as Record<string, unknown>).reviewBucket === "overflow" ? "overflow" : "primary";
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function runSerializable<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>) {
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
  throw new Error("Life Update confirmation retry loop exited unexpectedly");
}

export async function confirmLifeUpdate(
  userId: string,
  sourceId: string,
  now: Date = new Date(),
) {
  const result = await runSerializable(async (transaction) => {
    const source = await transaction.importSource.findFirst({
      where: { id: sourceId, userId },
      select: { id: true },
    });
    if (!source) throw new LifeUpdateConfirmationNotFoundError();

    const proposals = await transaction.importProposal.findMany({
      where: { sourceId, userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, status: true, kind: true, payload: true },
    });
    const plan = planLifeUpdateConfirmation(
      proposals.map((proposal) => ({
        id: proposal.id,
        status: proposal.status,
        reviewBucket: reviewBucket(proposal.payload),
        reviewDecision: parseProposalReviewDecision(proposal.payload),
      })),
    );

    if (!plan.selectedProposalIds.length) {
      return {
        status: plan.hasPreviouslyApplied ? ("already_confirmed" as const) : ("nothing_to_apply" as const),
        appliedProposalIds: [] as string[],
        affectedChapters: [] as Array<{ chapterId: string; event: "created" | "updated" }>,
        sourceState: await refreshImportSourceState(transaction, sourceId),
      };
    }

    const selectedSet = new Set(plan.selectedProposalIds);
    if (
      proposals.some(
        (proposal) =>
          selectedSet.has(proposal.id) && proposal.kind === ImportProposalKind.NEW_CHAPTER,
      )
    ) {
      await ensureTaxonomyCurrent(
        transaction as unknown as Parameters<typeof ensureTaxonomyCurrent>[0],
        userId,
      );
    }

    const appliedProposalIds: string[] = [];
    const affectedChapters: Array<{ chapterId: string; event: "created" | "updated" }> = [];
    for (const proposalId of plan.selectedProposalIds) {
      const application = await applyImportProposalInTransaction(
        transaction,
        userId,
        sourceId,
        proposalId,
        now,
      );
      appliedProposalIds.push(proposalId);
      const proposal = proposals.find((candidate) => candidate.id === proposalId);
      if ("chapterId" in application && typeof application.chapterId === "string") {
        affectedChapters.push({
          chapterId: application.chapterId,
          event: proposal?.kind === ImportProposalKind.NEW_CHAPTER ? "created" : "updated",
        });
      }
      if (proposal) {
        await transaction.importProposal.update({
          where: { id: proposalId },
          data: { payload: withoutProposalReviewDecision(proposal.payload) },
        });
      }
    }

    return {
      status: "applied" as const,
      appliedProposalIds,
      affectedChapters,
      sourceState: await refreshImportSourceState(transaction, sourceId),
    };
  });

  for (const affected of result.affectedChapters) {
    try {
      await markPursuitReadingDirty(userId, affected.chapterId, "import_proposal_applied", {
        details:
          affected.event === "created"
            ? { event: "created" }
            : { event: "updated", changes: [{ field: "background" }] },
      });
    } catch (error) {
      console.error("[imports] Confirmed Life Update but could not mark insights dirty", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return {
    status: result.status,
    appliedProposalIds: result.appliedProposalIds,
    sourceState: result.sourceState,
  };
}
