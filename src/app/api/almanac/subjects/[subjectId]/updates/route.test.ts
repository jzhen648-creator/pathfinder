import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createDirect: vi.fn() }));
vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/almanac/service")>();
  return {
    ...actual,
    createDirectAlmanacSubjectUpdate: (...args: unknown[]) => mocks.createDirect(...args),
  };
});

const requestBody = {
  idempotencyKey: "direct-update-001",
  action: "correction",
  state: "NOW",
  statement: "The corrected wording, exactly as written.",
  supersedesUpdateIds: ["update-old"],
  curation: { significance: "KEY" },
};

const createdResponse = {
  disposition: "created",
  importId: "import-direct",
  updateId: "update-direct",
  scope: "direct",
  originKind: "USER_ENTRY",
  supersedesUpdateIds: ["update-old"],
  curation: { hidden: false, significance: "KEY", targetDate: null },
  atlas: { updates: [{ id: "update-direct" }] },
};

describe("POST /api/almanac/subjects/[subjectId]/updates", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.createDirect.mockResolvedValue(createdResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function post(body: unknown = requestBody, capable = true) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/almanac/subjects/subject-a/updates", {
        method: "POST",
        ...(capable
          ? { headers: { "X-Almanac-Capabilities": "user-entry-v1" } }
          : {}),
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ subjectId: "subject-a" }) },
    );
  }

  it("uses the authenticated owner and returns the projection needed by the client", async () => {
    const response = await post();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(createdResponse);
    expect(mocks.createDirect).toHaveBeenCalledWith("user-a", "subject-a", requestBody);
    expect((await post({ ...requestBody, userId: "user-b" })).status).toBe(400);
  });

  it("returns 200 for an idempotent retry", async () => {
    mocks.createDirect.mockResolvedValue({
      ...createdResponse,
      disposition: "idempotent_retry",
    });

    expect((await post()).status).toBe(200);
  });

  it("fails closed before a direct write from an older client", async () => {
    const response = await post(requestBody, false);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Update Almanac to view this record.",
      code: "ALMANAC_CLIENT_UPGRADE_REQUIRED",
    });
    expect(mocks.createDirect).not.toHaveBeenCalled();
  });

  it("rejects ambiguous provenance lines and invalid resolution targets before the service", async () => {
    expect((await post({ ...requestBody, statement: "line one\nline two" })).status).toBe(400);
    expect(
      (await post({
        ...requestBody,
        action: "resolution",
        supersedesUpdateIds: ["update-old", "update-old"],
      })).status,
    ).toBe(400);
    expect(mocks.createDirect).not.toHaveBeenCalled();
  });

  it("requires explicit target-date precision", async () => {
    expect(
      (await post({
        ...requestBody,
        state: "NEXT",
        curation: { targetDate: { year: 2027, month: 3 } },
      })).status,
    ).toBe(400);
    expect(mocks.createDirect).not.toHaveBeenCalled();
  });

  it("rejects signed-out users before parsing or writing", async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    expect((await post()).status).toBe(401);
    expect(mocks.createDirect).not.toHaveBeenCalled();
  });
});
