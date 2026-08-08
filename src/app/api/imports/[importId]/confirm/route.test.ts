import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  confirmLifeUpdate: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));
vi.mock("@/lib/imports/confirm-life-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/confirm-life-update")>();
  return { ...actual, confirmLifeUpdate: (...args: unknown[]) => mocks.confirmLifeUpdate(...args) };
});

async function post(importId = "source-1") {
  const { POST } = await import("./route");
  return POST(new Request(`http://localhost/api/imports/${importId}/confirm`, { method: "POST" }), {
    params: Promise.resolve({ importId }),
  });
}

describe("POST /api/imports/[importId]/confirm", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "1");
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.confirmLifeUpdate.mockResolvedValue({
      status: "applied",
      appliedProposalIds: ["proposal-1"],
      sourceState: "APPLIED",
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
    expect(mocks.confirmLifeUpdate).not.toHaveBeenCalled();
  });

  it("confirms the owner-scoped Life Update", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.confirmLifeUpdate).toHaveBeenCalledWith("user-1", "source-1");
    expect(await response.json()).toMatchObject({ status: "applied" });
  });

  it("returns a safe incomplete-review conflict", async () => {
    const { LifeUpdateConfirmationConflictError } = await import(
      "@/lib/imports/confirm-life-update"
    );
    mocks.confirmLifeUpdate.mockRejectedValue(
      new LifeUpdateConfirmationConflictError(["private-proposal-id"]),
    );
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Review every primary item before applying this Life Update.",
      code: "INCOMPLETE_REVIEW",
    });
  });
});
