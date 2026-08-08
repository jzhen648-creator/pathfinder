import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  deleteImportCaptureReceipt,
  ImportCaptureReceiptNotFoundError,
} from "./capture-receipts";
import { ImportIdempotencyConflictError, ingestImportSource } from "./ingest-source";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const runtimeDatabaseUrl = process.env.DATABASE_URL?.trim();
const integrationSuite = testDatabaseUrl ? describe : describe.skip;
const testEmailDomain = "@imports.integration.invalid";

function assertSafeIntegrationDatabase(): void {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
  if (runtimeDatabaseUrl !== testDatabaseUrl) {
    throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL for integration tests.");
  }
  const parsedUrl = new URL(testDatabaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isLoopback = parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost";
  if (!isLoopback || !databaseName.startsWith("almanac_import_test")) {
    throw new Error("Refusing to run import integration tests outside the isolated local database.");
  }
}

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${label}-${crypto.randomUUID()}${testEmailDomain}` },
    select: { id: true },
  });
  return user.id;
}

function capture(clientImportId: string, rawText = "A durable thought from a conversation.") {
  return {
    clientImportId,
    contentType: "TEXT" as const,
    rawText,
    exactDuplicatePolicy: "IGNORE" as const,
    sourceApp: "Integration test",
  };
}

integrationSuite("import source persistence — PostgreSQL", () => {
  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: testEmailDomain } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("applies the source-model migration with the expected database shape", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('ImportSource', 'ImportCaptureReceipt', 'SourceFragment', 'SourceEvidenceSpan', 'LifeObservation', 'ObservationEvidenceSpan', 'ImportProposal', 'ImportProposalEvidence', 'ChapterRevision', 'ChapterRevisionEvidenceSpan')
      ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
      "ChapterRevision",
      "ChapterRevisionEvidenceSpan",
      "ImportCaptureReceipt",
      "ImportProposal",
      "ImportProposalEvidence",
      "ImportSource",
      "LifeObservation",
      "ObservationEvidenceSpan",
      "SourceEvidenceSpan",
      "SourceFragment",
    ]);

    const migration = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260801000000_source_to_life_model'
        AND finished_at IS NOT NULL
    `;
    expect(migration).toHaveLength(1);

    const receiptMigration = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260801010000_import_capture_receipts'
        AND finished_at IS NOT NULL
    `;
    expect(receiptMigration).toHaveLength(1);

    const semanticMigration = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260802000000_import_semantic_evidence'
        AND finished_at IS NOT NULL
    `;
    expect(semanticMigration).toHaveLength(1);

    const rowSecurity = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN (
          'ImportSource',
          'ImportCaptureReceipt',
          'SourceFragment',
          'SourceEvidenceSpan',
          'LifeObservation',
          'ObservationEvidence',
          'ObservationEvidenceSpan',
          'ChapterObservation',
          'ImportProposal',
          'ImportProposalEvidence',
          'ChapterRevision',
          'ChapterRevisionEvidence',
          'ChapterRevisionEvidenceSpan',
          'InterpretationCorrection',
          'ImportJob',
          'ImportSegmentRun'
        )
      ORDER BY relname
    `;
    expect(rowSecurity).toHaveLength(16);
    expect(rowSecurity.every((table) => table.relrowsecurity)).toBe(true);
  });

  it("persists the immutable source without creating AI jobs", async () => {
    const userId = await createUser("stored");
    const input = capture("database-capture-0001");
    const result = await ingestImportSource(userId, input);

    expect(result.disposition).toBe("created");
    const stored = await prisma.importSource.findUniqueOrThrow({ where: { id: result.source.id } });
    expect(stored).toMatchObject({
      userId,
      rawText: input.rawText,
      characterCount: input.rawText.length,
      state: "STORED",
    });
    expect(await prisma.importJob.count({ where: { sourceId: stored.id } })).toBe(0);
    expect(await prisma.importCaptureReceipt.count({ where: { sourceId: stored.id } })).toBe(1);
  });

  it("makes concurrent upload retries create exactly one source", async () => {
    const userId = await createUser("retry");
    const input = capture("database-capture-0002");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ingestImportSource(userId, input)),
    );

    expect(new Set(results.map((result) => result.source.id))).toHaveLength(1);
    expect(results.filter((result) => result.disposition === "created")).toHaveLength(1);
    expect(await prisma.importSource.count({ where: { userId } })).toBe(1);
    expect(await prisma.importCaptureReceipt.count({ where: { userId } })).toBe(1);
  });

  it("deduplicates concurrent equivalent captures before AI", async () => {
    const userId = await createUser("duplicate");
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        ingestImportSource(userId, capture(`database-duplicate-${String(index).padStart(4, "0")}`)),
      ),
    );

    expect(new Set(results.map((result) => result.source.id))).toHaveLength(1);
    expect(results.filter((result) => result.disposition === "created")).toHaveLength(1);
    expect(await prisma.importSource.count({ where: { userId } })).toBe(1);
    expect(await prisma.importCaptureReceipt.count({ where: { userId } })).toBe(8);
  });

  it("retains a duplicate separately only when explicitly requested", async () => {
    const userId = await createUser("retained");
    const first = await ingestImportSource(userId, capture("database-capture-0003"));
    const retained = await ingestImportSource(userId, {
      ...capture("database-capture-0004"),
      exactDuplicatePolicy: "RETAIN",
    });

    expect(retained.disposition).toBe("retained_duplicate");
    expect(retained.source.id).toBe(first.source.id);
    expect(retained.receipt).toMatchObject({
      sourceId: first.source.id,
      disposition: "DUPLICATE_RETAINED",
    });
    expect(await prisma.importSource.count({ where: { userId } })).toBe(1);
    expect(await prisma.importCaptureReceipt.count({ where: { userId } })).toBe(2);
  });

  it("rejects conflicting reuse of an idempotency key", async () => {
    const userId = await createUser("conflict");
    await ingestImportSource(userId, capture("database-capture-0005", "First source"));

    await expect(
      ingestImportSource(userId, capture("database-capture-0005", "Different source")),
    ).rejects.toBeInstanceOf(ImportIdempotencyConflictError);
    expect(await prisma.importSource.count({ where: { userId } })).toBe(1);
  });

  it("never deduplicates identical content across user boundaries", async () => {
    const firstUserId = await createUser("owner-a");
    const secondUserId = await createUser("owner-b");
    const first = await ingestImportSource(firstUserId, capture("database-capture-0006"));
    const second = await ingestImportSource(secondUserId, capture("database-capture-0006"));

    expect(second.source.id).not.toBe(first.source.id);
    expect(second.disposition).toBe("created");
  });

  it("preserves different capture URLs while canonicalizing identical selected text", async () => {
    const userId = await createUser("provenance");
    const first = await ingestImportSource(userId, {
      ...capture("database-capture-0007"),
      sourceApp: "ChatGPT",
      sourceUrl: "https://chatgpt.com/c/one",
    });
    const second = await ingestImportSource(userId, {
      ...capture("database-capture-0008"),
      sourceApp: "Claude",
      sourceUrl: "https://claude.ai/chat/two",
    });

    expect(second.source.id).toBe(first.source.id);
    expect(await prisma.importSource.count({ where: { userId } })).toBe(1);
    const receipts = await prisma.importCaptureReceipt.findMany({
      where: { userId },
      orderBy: { sourceApp: "asc" },
    });
    expect(receipts).toHaveLength(2);
    expect(receipts.map((receipt) => receipt.sourceApp)).toEqual(["ChatGPT", "Claude"]);
    expect(new Set(receipts.map((receipt) => receipt.sourceUrl))).toEqual(
      new Set(["https://chatgpt.com/c/one", "https://claude.ai/chat/two"]),
    );
  });

  it("deletes one receipt without deleting shared content, then tombstones the last source", async () => {
    const userId = await createUser("receipt-delete");
    const first = await ingestImportSource(userId, capture("database-capture-0009"));
    const second = await ingestImportSource(userId, capture("database-capture-0010"));
    const deletedAt = new Date("2026-08-01T05:00:00.000Z");

    const oneLeft = await deleteImportCaptureReceipt(userId, first.receipt.id, {
      now: () => deletedAt,
    });
    expect(oneLeft).toMatchObject({ status: "receipt_deleted", remainingReceipts: 1 });
    expect(
      await prisma.importSource.findUniqueOrThrow({ where: { id: first.source.id } }),
    ).toMatchObject({ deletedAt: null });

    const noneLeft = await deleteImportCaptureReceipt(userId, second.receipt.id, {
      now: () => deletedAt,
    });
    expect(noneLeft).toMatchObject({ status: "source_deleted", remainingReceipts: 0 });
    expect(
      await prisma.importSource.findUniqueOrThrow({ where: { id: first.source.id } }),
    ).toMatchObject({ state: "DELETED", deletedAt });

    const repeated = await deleteImportCaptureReceipt(userId, second.receipt.id, {
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(repeated).toMatchObject({ status: "already_deleted", sourceDeleted: true });
  });

  it("does not reveal or delete another user's capture receipt", async () => {
    const ownerId = await createUser("delete-owner");
    const otherUserId = await createUser("delete-other");
    const stored = await ingestImportSource(ownerId, capture("database-capture-0011"));

    await expect(
      deleteImportCaptureReceipt(otherUserId, stored.receipt.id),
    ).rejects.toBeInstanceOf(ImportCaptureReceiptNotFoundError);
    expect(
      await prisma.importCaptureReceipt.findUniqueOrThrow({ where: { id: stored.receipt.id } }),
    ).toMatchObject({ deletedAt: null });
  });

  it("creates a new canonical source after every receipt for the old source is deleted", async () => {
    const userId = await createUser("recapture");
    const first = await ingestImportSource(userId, capture("database-capture-0012"));
    await deleteImportCaptureReceipt(userId, first.receipt.id);

    const recaptured = await ingestImportSource(userId, capture("database-capture-0013"));
    expect(recaptured.disposition).toBe("created");
    expect(recaptured.source.id).not.toBe(first.source.id);
  });
});
