import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  reviewImportProposal: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

vi.mock("@/lib/imports/review-proposal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/review-proposal")>();
  return {
    ...actual,
    reviewImportProposal: (...args: unknown[]) => mocks.reviewImportProposal(...args),
  };
});

async function post(importId = "source-1", proposalId = "proposal-1") {
  const { POST } = await import("./route");
  return POST(
    new Request(`http://localhost/api/imports/${importId}/proposals/${proposalId}/accept`, {
      method: "POST",
    }),
    { params: Promise.resolve({ importId, proposalId }) },
  );
}

describe("POST /api/imports/[importId]/proposals/[proposalId]/accept", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "1");
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.reviewImportProposal.mockResolvedValue({
      proposal: { id: "proposal-1", status: "PENDING" },
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
    expect(mocks.reviewImportProposal).not.toHaveBeenCalled();
  });

  it("keeps proposal application feature-flagged off", async () => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "0");
    vi.stubEnv("AI_FAKE_PROVIDER", "0");

    expect((await post()).status).toBe(503);
    expect(mocks.reviewImportProposal).not.toHaveBeenCalled();
  });

  it("stages only the owner-scoped source and proposal", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    expect(mocks.reviewImportProposal).toHaveBeenCalledWith(
      "user-1",
      "source-1",
      "proposal-1",
      { action: "select" },
    );
    expect(await response.json()).toMatchObject({
      proposal: { id: "proposal-1", status: "PENDING" },
    });
  });

  it("returns a safe conflict code without source content", async () => {
    const { ImportProposalReviewConflictError } = await import(
      "@/lib/imports/review-proposal"
    );
    mocks.reviewImportProposal.mockRejectedValue(
      new ImportProposalReviewConflictError("ALREADY_APPLIED"),
    );

    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This proposal cannot be selected in its current state.",
      code: "ALREADY_APPLIED",
    });
  });

  it("uses the same 404 for missing and non-owned proposals", async () => {
    const { ImportProposalReviewNotFoundError } = await import(
      "@/lib/imports/review-proposal"
    );
    mocks.reviewImportProposal.mockRejectedValue(
      new ImportProposalReviewNotFoundError(),
    );

    const response = await post("not-owned", "not-owned");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Import proposal not found." });
  });

  it("does not leak private database errors", async () => {
    mocks.reviewImportProposal.mockRejectedValue(
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
