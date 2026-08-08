import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type {
  ImportCaptureReceiptRecord,
  ImportSourceRecord,
} from "@/lib/imports/ingest-source";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  ingestImportSource: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

vi.mock("@/lib/imports/ingest-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/ingest-source")>();
  return {
    ...actual,
    ingestImportSource: (...args: unknown[]) => mocks.ingestImportSource(...args),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importSource: {
      findMany: (...args: unknown[]) => mocks.findMany(...args),
    },
  },
}));

function source(overrides: Partial<ImportSourceRecord> = {}): ImportSourceRecord {
  return {
    id: "source-1",
    userId: "user-1",
    clientImportId: "capture-0001",
    contentType: "TEXT",
    contentHash: "hash-1",
    rawText: "A source worth keeping.",
    characterCount: 22,
    duplicateOfId: null,
    title: null,
    sourceUrl: null,
    sourceApp: "ChatGPT",
    capturedAt: null,
    state: "STORED",
    deletedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function receipt(
  overrides: Partial<ImportCaptureReceiptRecord> = {},
): ImportCaptureReceiptRecord {
  return {
    id: "receipt-1",
    userId: "user-1",
    sourceId: "source-1",
    clientImportId: "capture-0001",
    disposition: "PRIMARY",
    title: null,
    sourceUrl: null,
    sourceApp: "ChatGPT",
    capturedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function post(body: unknown, rawBody?: string) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    }),
  );
}

describe("/api/imports", () => {
  beforeEach(() => {
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.findMany.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns 401 before parsing or storing an unauthenticated capture", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post({ unexpected: true });
    expect(response.status).toBe(401);
    expect(mocks.ingestImportSource).not.toHaveBeenCalled();
  });

  it("stores a valid capture for the authenticated user", async () => {
    const stored = source();
    mocks.ingestImportSource.mockResolvedValue({
      source: stored,
      receipt: receipt(),
      disposition: "created",
    });

    const response = await post({
      clientImportId: "capture-0001",
      contentType: "TEXT",
      rawText: stored.rawText,
      sourceApp: "ChatGPT",
    });

    expect(response.status).toBe(201);
    expect(mocks.ingestImportSource).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ rawText: stored.rawText }),
    );
    expect(await response.json()).toMatchObject({
      disposition: "created",
      source: { id: "source-1", state: "STORED" },
      receipt: { id: "receipt-1", disposition: "PRIMARY" },
    });
  });

  it("returns 200 when the source is an exact duplicate", async () => {
    mocks.ingestImportSource.mockResolvedValue({
      source: source(),
      receipt: receipt({
        id: "receipt-2",
        clientImportId: "capture-0002",
        disposition: "DUPLICATE_IGNORED",
      }),
      disposition: "exact_duplicate",
    });

    const response = await post({
      clientImportId: "capture-0002",
      contentType: "TEXT",
      rawText: "A source worth keeping.",
    });
    expect(response.status).toBe(201);
    expect((await response.json()).disposition).toBe("exact_duplicate");
  });

  it("returns 201 when the caller explicitly retains an exact duplicate", async () => {
    mocks.ingestImportSource.mockResolvedValue({
      source: source(),
      receipt: receipt({
        id: "receipt-2",
        clientImportId: "capture-0002",
        disposition: "DUPLICATE_RETAINED",
      }),
      disposition: "retained_duplicate",
    });

    const response = await post({
      clientImportId: "capture-0002",
      contentType: "TEXT",
      rawText: "A source worth keeping.",
      exactDuplicatePolicy: "RETAIN",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      disposition: "retained_duplicate",
      source: { id: "source-1", duplicateOfId: null },
      receipt: { id: "receipt-2", disposition: "DUPLICATE_RETAINED" },
    });
  });

  it("returns a field-scoped 400 for an invalid payload", async () => {
    const response = await post({
      clientImportId: "short",
      contentType: "TEXT",
      rawText: "Valid words",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "clientImportId" });
    expect(mocks.ingestImportSource).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await post(undefined, "{");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "JSON body required" });
  });

  it("returns 409 when a client id is reused for different content", async () => {
    const { ImportIdempotencyConflictError } = await import("@/lib/imports/ingest-source");
    mocks.ingestImportSource.mockRejectedValue(new ImportIdempotencyConflictError());

    const response = await post({
      clientImportId: "capture-0001",
      contentType: "TEXT",
      rawText: "Different source",
    });
    expect(response.status).toBe(409);
  });

  it("does not leak internal errors or source text", async () => {
    mocks.ingestImportSource.mockRejectedValue(
      new Error("database failed while storing: private source text"),
    );

    const response = await post({
      clientImportId: "capture-0001",
      contentType: "TEXT",
      rawText: "private source text",
    });
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("private source text");
    expect(body).not.toContain("database failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private source text");
  });

  it("lists only through the authenticated-user query with the default limit", async () => {
    mocks.findMany.mockResolvedValue([source()]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/imports"));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", deletedAt: null }),
        take: 50,
      }),
    );
    const body = await response.json();
    expect(body.sources[0]).not.toHaveProperty("rawText");
    expect(body.sources[0]).not.toHaveProperty("userId");
  });

  it("rejects an out-of-range list limit without querying", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/imports?limit=101"));

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
