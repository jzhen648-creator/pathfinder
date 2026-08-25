import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), loadAtlas: vi.fn() }));

vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/almanac/service")>();
  return { ...actual, loadAlmanacAtlas: (...args: unknown[]) => mocks.loadAtlas(...args) };
});

describe("GET /api/almanac", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.loadAtlas.mockResolvedValue({ places: [], updates: [], imports: [] });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("authenticates before checking the server flag", async () => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "0");
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(401);
    expect(mocks.loadAtlas).not.toHaveBeenCalled();
  });

  it("fails closed when the server flag is off", async () => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "0");
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(503);
    expect(mocks.loadAtlas).not.toHaveBeenCalled();
  });

  it("loads only through the authenticated user scope", async () => {
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(200);
    expect(mocks.loadAtlas).toHaveBeenCalledWith("user-a");
  });
});
