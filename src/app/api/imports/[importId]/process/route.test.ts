import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  processImportSource: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));

// The budget guard reaches the database; the route suite covers status mapping,
// and the limits themselves are proven in processing-budget.test.ts.
vi.mock("@/lib/imports/enforce-processing-budget", () => ({
  enforceProcessingBudget: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/lib/imports/process-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imports/process-source")>();
  return {
    ...actual,
    processImportSource: (...args: unknown[]) => mocks.processImportSource(...args),
  };
});

async function post(importId = "source-1") {
  const { POST } = await import("./route");
  return POST(new Request(`http://localhost/api/imports/${importId}/process`, { method: "POST" }), {
    params: Promise.resolve({ importId }),
  });
}

describe("POST /api/imports/[importId]/process", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "1");
    vi.stubEnv("AI_FAKE_PROVIDER", "0");
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.processImportSource.mockResolvedValue({
      status: "completed",
      jobId: "job-1",
      proposalCount: 2,
      overflowCount: 0,
      retainedOnlyCount: 0,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("authenticates before checking the feature flag or processing", async () => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "0");
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await post();
    expect(response.status).toBe(401);
    expect(mocks.processImportSource).not.toHaveBeenCalled();
  });

  it("returns 503 when real processing is disabled", async () => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "0");

    const response = await post();
    expect(response.status).toBe(503);
    expect(mocks.processImportSource).not.toHaveBeenCalled();
  });

  it("allows deterministic fake-provider processing without enabling real AI", async () => {
    vi.stubEnv("IMPORT_PROCESSING_ENABLED", "0");
    vi.stubEnv("AI_FAKE_PROVIDER", "1");

    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.processImportSource).toHaveBeenCalledWith("user-1", "source-1");
  });

  it.each(["more_pending", "needs_retry", "already_processing"] as const)(
    "returns 202 for %s work",
    async (status) => {
      mocks.processImportSource.mockResolvedValue({ status, jobId: "job-1" });
      const response = await post();
      expect(response.status).toBe(202);
    },
  );

  it("returns 422 for a safely classified terminal failure", async () => {
    mocks.processImportSource.mockResolvedValue({
      status: "failed",
      jobId: "job-1",
      errorCode: "UNSAFE_PROVIDER_REFERENCE",
    });

    const response = await post();
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errorCode: "UNSAFE_PROVIDER_REFERENCE" });
  });

  it("returns the same 404 for a missing or non-owned source", async () => {
    const { ImportSourceProcessingNotFoundError } = await import("@/lib/imports/process-source");
    mocks.processImportSource.mockRejectedValue(new ImportSourceProcessingNotFoundError());

    const response = await post("not-owned");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Import source not found." });
  });

  it("does not leak provider errors or source text", async () => {
    mocks.processImportSource.mockRejectedValue(
      new Error("provider failed on private imported source text"),
    );

    const response = await post();
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("private imported source text");
    expect(body).not.toContain("provider failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private imported source text",
    );
  });
});
