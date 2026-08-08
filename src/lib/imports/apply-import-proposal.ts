import { ImportProposalKind, LifeMemoryDestination, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  applyPossibilityProposal,
  applyPossibilityProposalInTransaction,
  ImportProposalApplicationConflictError,
  ImportProposalApplicationNotFoundError,
  undoPossibilityProposalApplication,
} from "@/lib/imports/apply-possibility-proposal";
import {
  applyContextProposal,
  applyContextProposalInTransaction,
  undoContextProposalApplication,
} from "@/lib/imports/apply-context-proposal";
import {
  applyNewChapterProposal,
  applyNewChapterProposalInTransaction,
  undoNewChapterProposalApplication,
} from "@/lib/imports/apply-new-chapter-proposal";

export {
  ImportProposalApplicationConflictError,
  ImportProposalApplicationNotFoundError,
};

async function proposalDestination(userId: string, sourceId: string, proposalId: string) {
  const proposal = await prisma.importProposal.findFirst({
    where: { id: proposalId, sourceId, userId },
    select: { memoryDestination: true, kind: true },
  });
  if (!proposal) throw new ImportProposalApplicationNotFoundError();
  return proposal;
}

export async function applyImportProposal(
  userId: string,
  sourceId: string,
  proposalId: string,
) {
  const proposal = await proposalDestination(userId, sourceId, proposalId);
  if (proposal.kind === ImportProposalKind.NEW_CHAPTER) {
    return applyNewChapterProposal(userId, sourceId, proposalId);
  }
  if (proposal.memoryDestination === LifeMemoryDestination.POSSIBILITY) {
    return applyPossibilityProposal(userId, sourceId, proposalId);
  }
  if (
    proposal.memoryDestination === LifeMemoryDestination.BACKGROUND ||
    proposal.memoryDestination === LifeMemoryDestination.CHAPTER
  ) {
    return applyContextProposal(userId, sourceId, proposalId);
  }
  throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
}

export async function applyImportProposalInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
) {
  const proposal = await transaction.importProposal.findFirst({
    where: { id: proposalId, sourceId, userId },
    select: { memoryDestination: true, kind: true },
  });
  if (!proposal) throw new ImportProposalApplicationNotFoundError();
  if (proposal.kind === ImportProposalKind.NEW_CHAPTER) {
    return applyNewChapterProposalInTransaction(
      transaction,
      userId,
      sourceId,
      proposalId,
      now,
    );
  }
  if (proposal.memoryDestination === LifeMemoryDestination.POSSIBILITY) {
    return applyPossibilityProposalInTransaction(
      transaction,
      userId,
      sourceId,
      proposalId,
      now,
    );
  }
  if (
    proposal.memoryDestination === LifeMemoryDestination.BACKGROUND ||
    proposal.memoryDestination === LifeMemoryDestination.CHAPTER
  ) {
    return applyContextProposalInTransaction(
      transaction,
      userId,
      sourceId,
      proposalId,
      now,
    );
  }
  throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
}

export async function undoImportProposalApplication(
  userId: string,
  sourceId: string,
  proposalId: string,
) {
  const proposal = await proposalDestination(userId, sourceId, proposalId);
  if (proposal.kind === ImportProposalKind.NEW_CHAPTER) {
    return undoNewChapterProposalApplication(userId, sourceId, proposalId);
  }
  if (proposal.memoryDestination === LifeMemoryDestination.POSSIBILITY) {
    return undoPossibilityProposalApplication(userId, sourceId, proposalId);
  }
  if (
    proposal.memoryDestination === LifeMemoryDestination.BACKGROUND ||
    proposal.memoryDestination === LifeMemoryDestination.CHAPTER
  ) {
    return undoContextProposalApplication(userId, sourceId, proposalId);
  }
  throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
}
