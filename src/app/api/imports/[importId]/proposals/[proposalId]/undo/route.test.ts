import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  undoImportProposalApplication: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

vi.mock("@/lib/imports/apply-import-proposal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/apply-import-proposal")>();
  return {
    ...actual,
    undoImportProposalApplication: (...args: unknown[]) =>
      mocks.undoImportProposalApplication(...args),
  };
});

async function post(importId = "source-1", proposalId = "proposal-1") {
  const { POST } = await import("./route");
  return POST(
    new Request(`http://localhost/api/imports/${importId}/proposals/${proposalId}/undo`, {
      method: "POST",
    }),
    { params: Promise.resolve({ importId, proposalId }) },
  );
}

describe("POST /api/imports/[importId]/proposals/[proposalId]/undo", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "1");
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.undoImportProposalApplication.mockResolvedValue({
      status: "undone",
      proposalId: "proposal-1",
      sourceState: "AWAITING_REVIEW",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("authenticates before checking the feature flag", async () => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "0");
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    expect((await post()).status).toBe(401);
    expect(mocks.undoImportProposalApplication).not.toHaveBeenCalled();
  });

  it("undoes only the owner-scoped source and proposal", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(mocks.undoImportProposalApplication).toHaveBeenCalledWith(
      "user-1",
      "source-1",
      "proposal-1",
    );
    expect(await response.json()).toMatchObject({
      status: "undone",
      sourceState: "AWAITING_REVIEW",
    });
  });

  it("uses the same 404 for missing and non-owned proposals", async () => {
    const { ImportProposalApplicationNotFoundError } = await import(
      "@/lib/imports/apply-import-proposal"
    );
    mocks.undoImportProposalApplication.mockRejectedValue(
      new ImportProposalApplicationNotFoundError(),
    );

    expect((await post("not-owned", "not-owned")).status).toBe(404);
  });

  it("does not leak private database errors", async () => {
    mocks.undoImportProposalApplication.mockRejectedValue(
      new Error("private imported source body"),
    );

    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private imported source body");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private imported source body",
    );
  });
});
