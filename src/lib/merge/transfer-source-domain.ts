import type { Prisma } from "@prisma/client";
import type { SourceDomainOwnerTable } from "@/lib/merge/source-domain-owner-tables";

export type SourceDomainDbClient = Pick<Prisma.TransactionClient, SourceDomainOwnerTable>;

export type SourceDomainTransferResult = Record<SourceDomainOwnerTable, number>;

/**
 * Re-point every directly-owned source-domain row from the guest to the target.
 *
 * Statement order is load-bearing. `ImportCaptureReceipt` has a composite key
 * ("sourceId", "userId") -> ImportSource("id", "userId"), so ImportSource must
 * move first; its ON UPDATE CASCADE then carries the receipts. Moving receipts
 * first would violate that key. The explicit receipt update that follows
 * normally reports zero and exists so a receipt that escaped the cascade is
 * still moved rather than cascade-deleted with the guest.
 */
export async function transferSourceDomain(
  db: SourceDomainDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<SourceDomainTransferResult> {
  if (sourceUserId === targetUserId) {
    throw new Error("Cannot transfer source-domain ownership to the same user.");
  }
  const where = { userId: sourceUserId };
  const data = { userId: targetUserId };

  const importSource = await db.importSource.updateMany({ where, data });
  const importCaptureReceipt = await db.importCaptureReceipt.updateMany({ where, data });
  const lifeObservation = await db.lifeObservation.updateMany({ where, data });
  const chapterObservation = await db.chapterObservation.updateMany({ where, data });
  const importProposal = await db.importProposal.updateMany({ where, data });
  const importProposalApplication = await db.importProposalApplication.updateMany({ where, data });
  const chapterRevision = await db.chapterRevision.updateMany({ where, data });
  const interpretationCorrection = await db.interpretationCorrection.updateMany({ where, data });

  return {
    importSource: importSource.count,
    importCaptureReceipt: importCaptureReceipt.count,
    lifeObservation: lifeObservation.count,
    chapterObservation: chapterObservation.count,
    importProposal: importProposal.count,
    importProposalApplication: importProposalApplication.count,
    chapterRevision: chapterRevision.count,
    interpretationCorrection: interpretationCorrection.count,
  };
}
