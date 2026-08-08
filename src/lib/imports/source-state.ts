import {
  ImportProposalStatus,
  ImportSourceState,
  Prisma,
} from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/**
 * Derive source state from the durable review decisions. Keeping this in one
 * place prevents accept, defer, dismiss, and undo from drifting apart.
 */
export async function refreshImportSourceState(
  transaction: TransactionClient,
  sourceId: string,
): Promise<ImportSourceState> {
  const proposals = await transaction.importProposal.findMany({
    where: { sourceId },
    select: { status: true },
  });
  const hasAccepted = proposals.some(
    (proposal) => proposal.status === ImportProposalStatus.ACCEPTED,
  );
  const hasPending = proposals.some(
    (proposal) =>
      proposal.status === ImportProposalStatus.PENDING ||
      proposal.status === ImportProposalStatus.DEFERRED,
  );
  const state = hasPending
    ? hasAccepted
      ? ImportSourceState.PARTIALLY_APPLIED
      : ImportSourceState.AWAITING_REVIEW
    : hasAccepted
      ? ImportSourceState.APPLIED
      : proposals.length > 0
        ? ImportSourceState.DISMISSED
        : ImportSourceState.PROCESSED;

  await transaction.importSource.update({ where: { id: sourceId }, data: { state } });
  return state;
}
