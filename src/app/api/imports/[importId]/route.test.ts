import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  findFirst: vi.fn(),
  findGoals: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importSource: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
    },
    goal: {
      findMany: (...args: unknown[]) => mocks.findGoals(...args),
    },
  },
}));

async function get(importId: string) {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/imports/${importId}`), {
    params: Promise.resolve({ importId }),
  });
}

describe("GET /api/imports/[importId]", () => {
  beforeEach(() => {
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.findGoals.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns 401 without querying source content", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await get("source-1");
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("loads raw text only through an owner-scoped query", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "source-1",
      clientImportId: "capture-0001",
      contentType: "TEXT",
      characterCount: 13,
      duplicateOfId: null,
      title: null,
      sourceUrl: null,
      sourceApp: "Claude",
      capturedAt: null,
      state: "STORED",
      rawText: "Private words",
      jobs: [],
      proposals: [],
      captureReceipts: [
        {
          id: "receipt-1",
          clientImportId: "capture-0001",
          disposition: "PRIMARY",
          title: null,
          sourceUrl: null,
          sourceApp: "Claude",
          capturedAt: null,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const response = await get("source-1");
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "source-1", userId: "user-1", deletedAt: null }),
      }),
    );
    expect(await response.json()).toMatchObject({
      source: {
        rawText: "Private words",
        captures: [{ id: "receipt-1", sourceApp: "Claude" }],
        proposals: [],
      },
    });
  });

  it("uses the same 404 for missing and non-owned sources", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await get("someone-elses-source");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Source not found" });
  });

  it("returns a safe error when storage fails", async () => {
    mocks.findFirst.mockRejectedValue(new Error("Private database detail"));
    const response = await get("source-1");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("Private database detail");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "Private database detail",
    );
  });
});
