import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const RECEIPT_DELETE_TRANSACTION_ATTEMPTS = 3;

export class ImportCaptureReceiptNotFoundError extends Error {
  readonly code = "IMPORT_CAPTURE_RECEIPT_NOT_FOUND";

  constructor() {
    super("Import capture receipt not found");
    this.name = "ImportCaptureReceiptNotFoundError";
  }
}

export type DeleteImportCaptureReceiptResult =
  | { status: "receipt_deleted"; receiptId: string; sourceId: string; remainingReceipts: number }
  | { status: "source_deleted"; receiptId: string; sourceId: string; remainingReceipts: 0 }
  | { status: "already_deleted"; receiptId: string; sourceId: string; sourceDeleted: boolean };

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function deleteReceiptOnce(
  userId: string,
  receiptId: string,
  deletedAt: Date,
): Promise<DeleteImportCaptureReceiptResult> {
  return prisma.$transaction(async (transaction) => {
    const receipt = await transaction.importCaptureReceipt.findFirst({
      where: { id: receiptId, userId },
      include: { source: { select: { id: true, userId: true, deletedAt: true, state: true } } },
    });
    if (!receipt || receipt.source.userId !== userId) {
      throw new ImportCaptureReceiptNotFoundError();
    }
    if (receipt.deletedAt) {
      return {
        status: "already_deleted",
        receiptId,
        sourceId: receipt.sourceId,
        sourceDeleted: Boolean(receipt.source.deletedAt) || receipt.source.state === "DELETED",
      };
    }

    await transaction.importCaptureReceipt.update({
      where: { id: receiptId },
      data: { deletedAt },
    });
    const remainingReceipts = await transaction.importCaptureReceipt.count({
      where: { sourceId: receipt.sourceId, userId, deletedAt: null },
    });

    if (remainingReceipts > 0) {
      return {
        status: "receipt_deleted",
        receiptId,
        sourceId: receipt.sourceId,
        remainingReceipts,
      };
    }

    await transaction.importSource.updateMany({
      where: { id: receipt.sourceId, userId, deletedAt: null },
      data: { deletedAt, state: "DELETED" },
    });
    return {
      status: "source_deleted",
      receiptId,
      sourceId: receipt.sourceId,
      remainingReceipts: 0,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Soft-deletes one capture event. Canonical source content remains active while
 * another receipt exists; deleting the last receipt tombstones the source.
 * Confirmed observations/revisions are not hard-deleted by this operation.
 */
export async function deleteImportCaptureReceipt(
  userId: string,
  receiptId: string,
  options: { now?: () => Date } = {},
): Promise<DeleteImportCaptureReceiptResult> {
  const deletedAt = (options.now ?? (() => new Date()))();
  for (let attempt = 1; attempt <= RECEIPT_DELETE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await deleteReceiptOnce(userId, receiptId, deletedAt);
    } catch (error) {
      if (!hasPrismaCode(error, "P2034") || attempt === RECEIPT_DELETE_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error("Import receipt deletion transaction retry loop exited unexpectedly");
}
