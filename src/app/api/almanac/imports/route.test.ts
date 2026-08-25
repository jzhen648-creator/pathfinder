import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/almanac/service")>();
  return { ...actual, commitAlmanacImport: (...args: unknown[]) => mocks.commit(...args) };
});

const requestBody = {
  idempotencyKey: "client-import-001",
  rawPacket: "ALMANAC/1\nscope: chat\nStudio | NOW | Weekly sessions are active.",
  decisions: [{ lineNumber: 3, accepted: true }],
};

describe("POST /api/almanac/imports", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.commit.mockResolvedValue({ disposition: "created", import: { id: "import-a" }, atlas: {} });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function post(body: unknown = requestBody) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost/api/almanac/imports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  }

  it("rejects signed-out users before parsing or committing", async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await post()).status).toBe(401);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("fails closed when the server flag is off", async () => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "0");
    expect((await post()).status).toBe(503);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("uses the server-side session owner and never accepts userId", async () => {
    expect((await post()).status).toBe(201);
    expect(mocks.commit).toHaveBeenCalledWith("user-a", requestBody);
    expect((await post({ ...requestBody, userId: "user-b" })).status).toBe(400);
  });

  it("returns 200 for an idempotent retry", async () => {
    mocks.commit.mockResolvedValue({ disposition: "idempotent_retry", import: {}, atlas: {} });
    expect((await post()).status).toBe(200);
  });
});
