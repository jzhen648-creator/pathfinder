import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  deleteImportCaptureReceipt: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

vi.mock("@/lib/imports/capture-receipts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/capture-receipts")>();
  return {
    ...actual,
    deleteImportCaptureReceipt: (...args: unknown[]) => mocks.deleteImportCaptureReceipt(...args),
  };
});

async function remove(receiptId = "receipt-1") {
  const { DELETE } = await import("./route");
  return DELETE(
    new Request(`http://localhost/api/imports/captures/${receiptId}`, { method: "DELETE" }),
    { params: Promise.resolve({ receiptId }) },
  );
}

describe("DELETE /api/imports/captures/[receiptId]", () => {
  beforeEach(() => {
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.deleteImportCaptureReceipt.mockResolvedValue({
      status: "receipt_deleted",
      receiptId: "receipt-1",
      sourceId: "source-1",
      remainingReceipts: 1,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("authenticates before deleting", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const response = await remove();
    expect(response.status).toBe(401);
    expect(mocks.deleteImportCaptureReceipt).not.toHaveBeenCalled();
  });

  it("deletes only through the authenticated user scope", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(mocks.deleteImportCaptureReceipt).toHaveBeenCalledWith("user-1", "receipt-1");
    expect(await response.json()).toMatchObject({ status: "receipt_deleted" });
  });

  it("uses the same 404 for missing and non-owned captures", async () => {
    const { ImportCaptureReceiptNotFoundError } = await import("@/lib/imports/capture-receipts");
    mocks.deleteImportCaptureReceipt.mockRejectedValue(new ImportCaptureReceiptNotFoundError());
    const response = await remove("not-owned");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Capture not found." });
  });

  it("does not leak storage errors", async () => {
    mocks.deleteImportCaptureReceipt.mockRejectedValue(new Error("private capture contents"));
    const response = await remove();
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("private capture contents");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private capture contents",
    );
  });
});
