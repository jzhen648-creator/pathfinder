import type { Prisma } from "@prisma/client";
import type { SourceDomainOwnerTable } from "@/lib/merge/source-domain-owner-tables";

export type SourceDomainAssertionDbClient = Pick<
  Prisma.TransactionClient,
  SourceDomainOwnerTable | "sourceFragment" | "sourceEvidenceSpan" | "importJob"
>;

export class SourceDomainNotTransferredError extends Error {
  readonly code = "SOURCE_DOMAIN_NOT_TRANSFERRED" as const;

  constructor(readonly stranded: Record<string, number>) {
    super(
      `Refusing to delete the guest account: ${Object.entries(stranded)
        .map(([table, count]) => `${table}=${count}`)
        .join(", ")}`,
    );
    this.name = "SourceDomainNotTransferredError";
  }
}

/**
 * Last gate before the guest user is deleted.
 *
 * Every source-domain table cascades from User, so a single row left behind is
 * destroyed along with its citations and undo history. This proves the transfer
 * is complete and throws to roll the whole merge back if it is not.
 *
 * Checks directly-owned rows and rows that reach the guest transitively through
 * an ImportSource that never moved.
 */
export async function assertSourceDomainTransferred(
  db: SourceDomainAssertionDbClient,
  sourceUserId: string,
): Promise<void> {
  const where = { userId: sourceUserId };
  const parentWhere = { source: { userId: sourceUserId } };

  const counts: Record<string, number> = {
    importSource: await db.importSource.count({ where }),
    importCaptureReceipt: await db.importCaptureReceipt.count({ where }),
    lifeObservation: await db.lifeObservation.count({ where }),
    chapterObservation: await db.chapterObservation.count({ where }),
    importProposal: await db.importProposal.count({ where }),
    importProposalApplication: await db.importProposalApplication.count({ where }),
    chapterRevision: await db.chapterRevision.count({ where }),
    interpretationCorrection: await db.interpretationCorrection.count({ where }),
    sourceFragment: await db.sourceFragment.count({ where: parentWhere }),
    sourceEvidenceSpan: await db.sourceEvidenceSpan.count({ where: parentWhere }),
    importJob: await db.importJob.count({ where: parentWhere }),
  };

  const stranded = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  if (Object.keys(stranded).length > 0) {
    throw new SourceDomainNotTransferredError(stranded);
  }
}
