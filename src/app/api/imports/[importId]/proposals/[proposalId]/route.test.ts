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

async function patch(body: unknown) {
  const { PATCH } = await import("./route");
  return PATCH(
    new Request("http://localhost/api/imports/source-1/proposals/proposal-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ importId: "source-1", proposalId: "proposal-1" }) },
  );
}

describe("PATCH /api/imports/[importId]/proposals/[proposalId]", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "1");
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.reviewImportProposal.mockResolvedValue({
      proposal: { id: "proposal-1", status: "DEFERRED" },
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

  it("authenticates before parsing a review action", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await patch({ unexpected: true })).status).toBe(401);
    expect(mocks.reviewImportProposal).not.toHaveBeenCalled();
  });

  it("saves an owner-scoped defer decision", async () => {
    const response = await patch({ action: "defer" });
    expect(response.status).toBe(200);
    expect(mocks.reviewImportProposal).toHaveBeenCalledWith(
      "user-1",
      "source-1",
      "proposal-1",
      { action: "defer" },
    );
  });

  it("rejects malformed corrections", async () => {
    const response = await patch({ action: "edit", proposedText: "" });
    expect(response.status).toBe(400);
    expect(mocks.reviewImportProposal).not.toHaveBeenCalled();
  });

  it("accepts a typed new-chapter destination correction", async () => {
    const response = await patch({
      action: "set_new_chapter",
      title: "Return to London",
      primaryThemeId: "people",
    });
    expect(response.status).toBe(200);
    expect(mocks.reviewImportProposal).toHaveBeenCalledWith(
      "user-1",
      "source-1",
      "proposal-1",
      {
        action: "set_new_chapter",
        title: "Return to London",
        primaryThemeId: "people",
      },
    );
  });
});
