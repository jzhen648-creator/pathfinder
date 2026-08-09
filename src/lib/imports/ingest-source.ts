import {
  Prisma,
  type ImportCaptureDisposition,
  type ImportCaptureReceipt,
  type ImportSource,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fingerprintSource, normalizeSourceText } from "@/lib/imports/source-identity";

export { MAX_IMPORT_SOURCE_CHARACTERS } from "@/lib/imports/processing-budget";
import { MAX_IMPORT_SOURCE_CHARACTERS } from "@/lib/imports/processing-budget";
export const IMPORT_LIST_DEFAULT_LIMIT = 50;
export const IMPORT_LIST_MAX_LIMIT = 100;
const IMPORT_TRANSACTION_ATTEMPTS = 3;

export const createImportSourceSchema = z
  .object({
    clientImportId: z.string().trim().min(8).max(128),
    contentType: z.enum(["TEXT", "URL"]),
    rawText: z.string().min(1).max(MAX_IMPORT_SOURCE_CHARACTERS),
    exactDuplicatePolicy: z.enum(["IGNORE", "RETAIN"]).default("IGNORE"),
    title: z.string().trim().min(1).max(200).optional(),
    sourceUrl: z.string().trim().max(2_048).url().optional(),
    sourceApp: z.string().trim().min(1).max(80).optional(),
    capturedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (normalizeSourceText(input.rawText).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["rawText"],
        message: "rawText must contain visible text",
      });
    }
    if (input.contentType === "URL" && !input.sourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "sourceUrl is required when contentType is URL",
      });
    }
  });

export const importListLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(IMPORT_LIST_MAX_LIMIT)
  .default(IMPORT_LIST_DEFAULT_LIMIT);

export type CreateImportSourceInput = z.infer<typeof createImportSourceSchema>;

export const IMPORT_SOURCE_SUMMARY_SELECT = {
  id: true,
  clientImportId: true,
  contentType: true,
  characterCount: true,
  duplicateOfId: true,
  title: true,
  sourceUrl: true,
  sourceApp: true,
  capturedAt: true,
  state: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const IMPORT_SOURCE_DETAIL_SELECT = {
  ...IMPORT_SOURCE_SUMMARY_SELECT,
  rawText: true,
  captureReceipts: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientImportId: true,
      disposition: true,
      title: true,
      sourceUrl: true,
      sourceApp: true,
      capturedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export type ImportSourceRecord = Pick<
  ImportSource,
  | "id"
  | "userId"
  | "clientImportId"
  | "contentType"
  | "contentHash"
  | "rawText"
  | "characterCount"
  | "duplicateOfId"
  | "title"
  | "sourceUrl"
  | "sourceApp"
  | "capturedAt"
  | "state"
  | "deletedAt"
  | "createdAt"
  | "updatedAt"
>;

type CreateStoredSource = Omit<
  ImportSourceRecord,
  "id" | "deletedAt" | "createdAt" | "updatedAt"
> & {
  state: "STORED";
};

export type ImportCaptureReceiptRecord = Pick<
  ImportCaptureReceipt,
  | "id"
  | "userId"
  | "sourceId"
  | "clientImportId"
  | "disposition"
  | "title"
  | "sourceUrl"
  | "sourceApp"
  | "capturedAt"
  | "deletedAt"
  | "createdAt"
  | "updatedAt"
>;

type CreateCaptureReceipt = Omit<
  ImportCaptureReceiptRecord,
  "id" | "deletedAt" | "createdAt" | "updatedAt"
>;

export type ImportCaptureReceiptWithSource = {
  receipt: ImportCaptureReceiptRecord;
  source: ImportSourceRecord;
};

export interface ImportSourceTransaction {
  findByClientImportId(
    userId: string,
    clientImportId: string,
  ): Promise<ImportCaptureReceiptWithSource | null>;
  findExactDuplicate(userId: string, contentHash: string): Promise<ImportSourceRecord | null>;
  createSource(data: CreateStoredSource): Promise<ImportSourceRecord>;
  createReceipt(data: CreateCaptureReceipt): Promise<ImportCaptureReceiptRecord>;
}

export interface ImportSourceStore {
  transaction<T>(operation: (transaction: ImportSourceTransaction) => Promise<T>): Promise<T>;
}

const prismaImportSourceStore: ImportSourceStore = {
  transaction: (operation) =>
    prisma.$transaction(
      async (transaction) =>
        operation({
          findByClientImportId: (userId, clientImportId) =>
            transaction.importCaptureReceipt
              .findUnique({
                where: { userId_clientImportId: { userId, clientImportId } },
                include: { source: true },
              })
              .then((result) =>
                result ? { receipt: result, source: result.source } : null,
              ),
          findExactDuplicate: (userId, contentHash) =>
            transaction.importSource.findFirst({
              where: {
                userId,
                contentHash,
                duplicateOfId: null,
                deletedAt: null,
                state: { not: "DELETED" },
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            }),
          createSource: (data) => transaction.importSource.create({ data }),
          createReceipt: (data) => transaction.importCaptureReceipt.create({ data }),
        }),
      // Database uniqueness protects canonical artifacts and receipt idempotency.
      // Read committed avoids unnecessary serialization failures when many
      // distinct receipts arrive for the same artifact concurrently.
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        // Capture bursts can legitimately queue behind another short import
        // transaction. Keep the wait bounded, but do not fail at Prisma's
        // two-second default before uniqueness/idempotency can do their job.
        maxWait: 10_000,
        timeout: 20_000,
      },
    ),
};

export type ImportDisposition =
  | "created"
  | "idempotent_retry"
  | "exact_duplicate"
  | "retained_duplicate";

export type IngestImportSourceResult = {
  source: ImportSourceRecord;
  receipt: ImportCaptureReceiptRecord;
  disposition: ImportDisposition;
};

export class ImportIdempotencyConflictError extends Error {
  readonly code = "IMPORT_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("clientImportId has already been used for another source");
    this.name = "ImportIdempotencyConflictError";
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function ingestOnce(
  userId: string,
  input: CreateImportSourceInput,
  contentHash: string,
  store: ImportSourceStore,
): Promise<IngestImportSourceResult> {
  return store.transaction(async (transaction) => {
    const priorAttempt = await transaction.findByClientImportId(userId, input.clientImportId);
    if (priorAttempt) {
      if (
        priorAttempt.receipt.deletedAt ||
        priorAttempt.source.deletedAt ||
        priorAttempt.source.contentHash !== contentHash
      ) {
        throw new ImportIdempotencyConflictError();
      }
      return {
        source: priorAttempt.source,
        receipt: priorAttempt.receipt,
        disposition: "idempotent_retry",
      };
    }

    const duplicate = await transaction.findExactDuplicate(userId, contentHash);
    if (duplicate) {
      const disposition: ImportCaptureDisposition =
        input.exactDuplicatePolicy === "RETAIN"
          ? "DUPLICATE_RETAINED"
          : "DUPLICATE_IGNORED";
      const receipt = await transaction.createReceipt({
        userId,
        sourceId: duplicate.id,
        clientImportId: input.clientImportId,
        disposition,
        title: input.title ?? null,
        sourceUrl: input.sourceUrl ?? null,
        sourceApp: input.sourceApp ?? null,
        capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
      });
      return {
        source: duplicate,
        receipt,
        disposition:
          disposition === "DUPLICATE_RETAINED" ? "retained_duplicate" : "exact_duplicate",
      };
    }

    const source = await transaction.createSource({
      userId,
      clientImportId: input.clientImportId,
      contentType: input.contentType,
      contentHash,
      rawText: input.rawText,
      characterCount: input.rawText.length,
      duplicateOfId: null,
      title: input.title ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceApp: input.sourceApp ?? null,
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
      state: "STORED",
    });

    const receipt = await transaction.createReceipt({
      userId,
      sourceId: source.id,
      clientImportId: input.clientImportId,
      disposition: "PRIMARY",
      title: input.title ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceApp: input.sourceApp ?? null,
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
    });

    return { source, receipt, disposition: "created" };
  });
}

/** Stores an immutable source. It deliberately does not enqueue or run AI. */
export async function ingestImportSource(
  userId: string,
  input: CreateImportSourceInput,
  store: ImportSourceStore = prismaImportSourceStore,
): Promise<IngestImportSourceResult> {
  const contentHash = fingerprintSource(input);

  for (let attempt = 1; attempt <= IMPORT_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await ingestOnce(userId, input, contentHash, store);
    } catch (error) {
      const canRetry = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!canRetry || attempt === IMPORT_TRANSACTION_ATTEMPTS) throw error;
    }
  }

  throw new Error("Import transaction retry loop exited unexpectedly");
}

type ImportSourceSummary = Pick<
  ImportSource,
  | "id"
  | "clientImportId"
  | "contentType"
  | "characterCount"
  | "duplicateOfId"
  | "title"
  | "sourceUrl"
  | "sourceApp"
  | "capturedAt"
  | "state"
  | "createdAt"
  | "updatedAt"
>;

type ImportCaptureReceiptSummary = Pick<
  ImportCaptureReceipt,
  | "id"
  | "clientImportId"
  | "disposition"
  | "title"
  | "sourceUrl"
  | "sourceApp"
  | "capturedAt"
  | "createdAt"
  | "updatedAt"
>;

export function serializeImportCaptureReceipt(receipt: ImportCaptureReceiptSummary) {
  return {
    id: receipt.id,
    clientImportId: receipt.clientImportId,
    disposition: receipt.disposition,
    title: receipt.title,
    sourceUrl: receipt.sourceUrl,
    sourceApp: receipt.sourceApp,
    capturedAt: receipt.capturedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
  };
}

export function serializeImportSourceSummary(source: ImportSourceSummary) {
  return {
    id: source.id,
    clientImportId: source.clientImportId,
    contentType: source.contentType,
    characterCount: source.characterCount,
    duplicateOfId: source.duplicateOfId,
    title: source.title,
    sourceUrl: source.sourceUrl,
    sourceApp: source.sourceApp,
    state: source.state,
    capturedAt: source.capturedAt?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

export function serializeImportSourceDetail(
  source: ImportSourceSummary & {
    rawText: string;
    captureReceipts?: readonly ImportCaptureReceiptSummary[];
  },
) {
  return {
    ...serializeImportSourceSummary(source),
    rawText: source.rawText,
    captures: source.captureReceipts?.map(serializeImportCaptureReceipt) ?? [],
  };
}
