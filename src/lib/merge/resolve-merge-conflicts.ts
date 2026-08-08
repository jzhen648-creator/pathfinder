import type { Prisma } from "@prisma/client";

export type MergeConflictDbClient = Pick<
  Prisma.TransactionClient,
  "importSource" | "importCaptureReceipt"
>;

export type MergeConflictResult = {
  renamedSources: number;
  renamedReceipts: number;
  linkedDuplicates: number;
};

/**
 * Deterministic suffix for a guest client import id that already exists on the
 * target account. Stable across retries so a repeated merge is idempotent.
 */
export function mergedClientImportId(clientImportId: string, sourceUserId: string): string {
  return `${clientImportId}:merged:${sourceUserId}`;
}

/**
 * Resolve unique-key collisions before ownership moves.
 *
 * `ImportSource` and `ImportCaptureReceipt` are both unique on
 * ("userId", "clientImportId"). A guest and a target may legitimately hold the
 * same client id, so the guest row is renamed deterministically.
 *
 * When the colliding rows carry the same canonical content the guest source is
 * additionally linked to the target's source through `duplicateOfId`. Neither
 * row is deleted and no receipt is discarded, so each deliberate arrival keeps
 * its own app, URL and timestamp.
 *
 * Runs while the rows are still guest-owned.
 */
export async function resolveMergeConflicts(
  db: MergeConflictDbClient,
  sourceUserId: string,
  targetUserId: string,
): Promise<MergeConflictResult> {
  const [guestSources, targetSources] = await Promise.all([
    db.importSource.findMany({
      where: { userId: sourceUserId },
      select: { id: true, clientImportId: true, contentHash: true },
      orderBy: { id: "asc" },
    }),
    db.importSource.findMany({
      where: { userId: targetUserId },
      select: { id: true, clientImportId: true, contentHash: true },
    }),
  ]);

  const targetByClientId = new Map(targetSources.map((s) => [s.clientImportId, s]));
  const targetByHash = new Map<string, string>();
  for (const s of targetSources) {
    if (!targetByHash.has(s.contentHash)) targetByHash.set(s.contentHash, s.id);
  }

  let renamedSources = 0;
  let linkedDuplicates = 0;

  for (const guest of guestSources) {
    const clash = targetByClientId.get(guest.clientImportId);
    const duplicateOfId = targetByHash.get(guest.contentHash) ?? null;
    const data: { clientImportId?: string; duplicateOfId?: string } = {};

    if (clash) {
      data.clientImportId = mergedClientImportId(guest.clientImportId, sourceUserId);
      renamedSources += 1;
    }
    if (duplicateOfId && duplicateOfId !== guest.id) {
      data.duplicateOfId = duplicateOfId;
      linkedDuplicates += 1;
    }
    if (Object.keys(data).length > 0) {
      await db.importSource.update({ where: { id: guest.id }, data });
    }
  }

  const [guestReceipts, targetReceipts] = await Promise.all([
    db.importCaptureReceipt.findMany({
      where: { userId: sourceUserId },
      select: { id: true, clientImportId: true },
      orderBy: { id: "asc" },
    }),
    db.importCaptureReceipt.findMany({
      where: { userId: targetUserId },
      select: { clientImportId: true },
    }),
  ]);

  const targetReceiptIds = new Set(targetReceipts.map((r) => r.clientImportId));
  let renamedReceipts = 0;
  for (const receipt of guestReceipts) {
    if (!targetReceiptIds.has(receipt.clientImportId)) continue;
    await db.importCaptureReceipt.update({
      where: { id: receipt.id },
      data: { clientImportId: mergedClientImportId(receipt.clientImportId, sourceUserId) },
    });
    renamedReceipts += 1;
  }

  return { renamedSources, renamedReceipts, linkedDuplicates };
}
