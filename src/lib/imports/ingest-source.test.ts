import { describe, expect, it } from "vitest";
import {
  createImportSourceSchema,
  ImportIdempotencyConflictError,
  ingestImportSource,
  MAX_IMPORT_SOURCE_CHARACTERS,
  type ImportCaptureReceiptRecord,
  type ImportSourceRecord,
  type ImportSourceStore,
  type ImportSourceTransaction,
} from "./ingest-source";

type CreateSourceData = Parameters<ImportSourceTransaction["createSource"]>[0];
type CreateReceiptData = Parameters<ImportSourceTransaction["createReceipt"]>[0];

class MemoryImportSourceStore implements ImportSourceStore {
  readonly sources: ImportSourceRecord[] = [];
  readonly receipts: ImportCaptureReceiptRecord[] = [];
  readonly failures: unknown[] = [];
  transactionCount = 0;

  async transaction<T>(operation: (transaction: ImportSourceTransaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const failure = this.failures.shift();
    if (failure) throw failure;

    return operation({
      findByClientImportId: async (userId, clientImportId) =>
        (() => {
          const receipt = this.receipts.find(
            (candidate) =>
              candidate.userId === userId && candidate.clientImportId === clientImportId,
          );
          const source = receipt
            ? this.sources.find((candidate) => candidate.id === receipt.sourceId)
            : null;
          return receipt && source ? { receipt, source } : null;
        })(),
      findExactDuplicate: async (userId, contentHash) =>
        [...this.sources]
          .filter(
            (source) =>
              source.userId === userId &&
              source.contentHash === contentHash &&
              !source.duplicateOfId &&
              !source.deletedAt &&
              source.state !== "DELETED",
          )
          .sort((a, b) => {
            const byTime = a.createdAt.getTime() - b.createdAt.getTime();
            return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
          })[0] ?? null,
      createSource: async (data) => this.createSource(data),
      createReceipt: async (data) => this.createReceipt(data),
    });
  }

  private createSource(data: CreateSourceData): ImportSourceRecord {
    const now = new Date(`2026-08-01T00:00:${String(this.sources.length).padStart(2, "0")}.000Z`);
    const source: ImportSourceRecord = {
      ...data,
      id: `source-${this.sources.length + 1}`,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sources.push(source);
    return source;
  }

  private createReceipt(data: CreateReceiptData): ImportCaptureReceiptRecord {
    const now = new Date(`2026-08-01T00:01:${String(this.receipts.length).padStart(2, "0")}.000Z`);
    const receipt: ImportCaptureReceiptRecord = {
      ...data,
      id: `receipt-${this.receipts.length + 1}`,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.receipts.push(receipt);
    return receipt;
  }
}

const baseInput = {
  clientImportId: "capture-0001",
  contentType: "TEXT" as const,
  rawText: "I want to change careers next year.",
  exactDuplicatePolicy: "IGNORE" as const,
  sourceApp: "ChatGPT",
};

describe("createImportSourceSchema", () => {
  it("accepts a bounded text capture", () => {
    expect(createImportSourceSchema.safeParse(baseInput).success).toBe(true);
  });

  it("rejects whitespace-only content", () => {
    const result = createImportSourceSchema.safeParse({ ...baseInput, rawText: " \n\t " });
    expect(result.success).toBe(false);
  });

  it("rejects payloads over the source character limit", () => {
    const result = createImportSourceSchema.safeParse({
      ...baseInput,
      rawText: "x".repeat(MAX_IMPORT_SOURCE_CHARACTERS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("requires provenance URL for URL captures", () => {
    const result = createImportSourceSchema.safeParse({ ...baseInput, contentType: "URL" });
    expect(result.success).toBe(false);
  });
});

describe("ingestImportSource", () => {
  it("stores the immutable raw source without starting AI processing", async () => {
    const store = new MemoryImportSourceStore();
    const result = await ingestImportSource("user-1", baseInput, store);

    expect(result.disposition).toBe("created");
    expect(result.source).toMatchObject({
      userId: "user-1",
      rawText: baseInput.rawText,
      characterCount: baseInput.rawText.length,
      state: "STORED",
    });
    expect(store.sources).toHaveLength(1);
    expect(store.receipts).toHaveLength(1);
    expect(result.receipt).toMatchObject({ disposition: "PRIMARY", sourceApp: "ChatGPT" });
  });

  it("returns the original source for an idempotent retry", async () => {
    const store = new MemoryImportSourceStore();
    const first = await ingestImportSource("user-1", baseInput, store);
    const retry = await ingestImportSource("user-1", baseInput, store);

    expect(retry).toMatchObject({ disposition: "idempotent_retry" });
    expect(retry.source.id).toBe(first.source.id);
    expect(retry.receipt.id).toBe(first.receipt.id);
    expect(store.sources).toHaveLength(1);
    expect(store.receipts).toHaveLength(1);
  });

  it("rejects reuse of a client id for different content", async () => {
    const store = new MemoryImportSourceStore();
    await ingestImportSource("user-1", baseInput, store);

    await expect(
      ingestImportSource("user-1", { ...baseInput, rawText: "Different content" }, store),
    ).rejects.toBeInstanceOf(ImportIdempotencyConflictError);
    expect(store.sources).toHaveLength(1);
  });

  it("collapses an exact duplicate even when transport whitespace differs", async () => {
    const store = new MemoryImportSourceStore();
    const first = await ingestImportSource("user-1", baseInput, store);
    const duplicate = await ingestImportSource(
      "user-1",
      {
        ...baseInput,
        clientImportId: "capture-0002",
        rawText: `${baseInput.rawText}  \r\n`,
      },
      store,
    );

    expect(duplicate.disposition).toBe("exact_duplicate");
    expect(duplicate.source.id).toBe(first.source.id);
    expect(store.sources).toHaveLength(1);
    expect(store.receipts).toHaveLength(2);
    expect(duplicate.receipt).toMatchObject({
      sourceId: first.source.id,
      disposition: "DUPLICATE_IGNORED",
    });
  });

  it("retains an exact duplicate receipt without copying canonical content", async () => {
    const store = new MemoryImportSourceStore();
    const first = await ingestImportSource("user-1", baseInput, store);
    const retained = await ingestImportSource(
      "user-1",
      {
        ...baseInput,
        clientImportId: "capture-0002",
        exactDuplicatePolicy: "RETAIN",
      },
      store,
    );

    expect(retained.disposition).toBe("retained_duplicate");
    expect(retained.source.id).toBe(first.source.id);
    expect(retained.receipt).toMatchObject({
      sourceId: first.source.id,
      disposition: "DUPLICATE_RETAINED",
    });
    expect(store.sources).toHaveLength(1);
    expect(store.receipts).toHaveLength(2);
  });

  it("never deduplicates across users", async () => {
    const store = new MemoryImportSourceStore();
    await ingestImportSource("user-1", baseInput, store);
    const second = await ingestImportSource("user-2", baseInput, store);

    expect(second.disposition).toBe("created");
    expect(store.sources).toHaveLength(2);
    expect(store.receipts).toHaveLength(2);
  });

  it("does not resurrect a source deleted under the same client id", async () => {
    const store = new MemoryImportSourceStore();
    await ingestImportSource("user-1", baseInput, store);
    store.sources[0]!.deletedAt = new Date("2026-08-02T00:00:00.000Z");
    store.sources[0]!.state = "DELETED";
    store.receipts[0]!.deletedAt = new Date("2026-08-02T00:00:00.000Z");

    await expect(ingestImportSource("user-1", baseInput, store)).rejects.toBeInstanceOf(
      ImportIdempotencyConflictError,
    );
  });

  it("retries a database transaction conflict", async () => {
    const store = new MemoryImportSourceStore();
    store.failures.push({ code: "P2034" });

    const result = await ingestImportSource("user-1", baseInput, store);
    expect(result.disposition).toBe("created");
    expect(store.transactionCount).toBe(2);
  });

  it("stops after the bounded transaction retry count", async () => {
    const store = new MemoryImportSourceStore();
    store.failures.push({ code: "P2034" }, { code: "P2034" }, { code: "P2034" });

    await expect(ingestImportSource("user-1", baseInput, store)).rejects.toMatchObject({
      code: "P2034",
    });
    expect(store.transactionCount).toBe(3);
  });
});
