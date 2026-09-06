import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), loadAtlas: vi.fn(), eraseAlmanac: vi.fn() }));

vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/almanac/service")>();
  return { ...actual, loadAlmanacAtlas: (...args: unknown[]) => mocks.loadAtlas(...args) };
});
vi.mock("@/lib/account-data", () => ({
  eraseAlmanacForUser: (...args: unknown[]) => mocks.eraseAlmanac(...args),
}));

describe("GET /api/almanac", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.loadAtlas.mockResolvedValue({ places: [], updates: [], imports: [] });
    mocks.eraseAlmanac.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function capableRequest() {
    return new Request("https://example.test/api/almanac", {
      headers: { "X-Almanac-Capabilities": "user-entry-v1" },
    });
  }

  function persistentSuggestionRequest() {
    return new Request("https://example.test/api/almanac", {
      headers: {
        "X-Almanac-Capabilities": "user-entry-v1, persistent-suggestions-v1",
      },
    });
  }

  it("authenticates before checking the server flag", async () => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "0");
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    expect((await GET(capableRequest())).status).toBe(401);
    expect(mocks.loadAtlas).not.toHaveBeenCalled();
  });

  it("fails closed when the server flag is off", async () => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "0");
    const { GET } = await import("./route");
    expect((await GET(capableRequest())).status).toBe(503);
    expect(mocks.loadAtlas).not.toHaveBeenCalled();
  });

  it("loads only through the authenticated user scope", async () => {
    const { GET } = await import("./route");
    expect((await GET(capableRequest())).status).toBe(200);
    expect(mocks.loadAtlas).toHaveBeenCalledWith("user-a");
  });

  it("gives older clients only active accepted lifecycle Updates", async () => {
    mocks.loadAtlas.mockResolvedValue({
      places: [],
      imports: [
        { id: "legacy", receipt: { version: 1 } },
        { id: "source", receipt: { version: 2, mode: "persistent_suggestions" } },
      ],
      updates: [
        { id: "legacy-update", importId: "legacy", active: false },
        { id: "accepted", importId: "source", active: true, originKind: "AI_RESPONSE" },
        { id: "undone", importId: "source", active: false, originKind: "AI_RESPONSE" },
      ],
    });
    const { GET } = await import("./route");
    const legacyBody = await (await GET(capableRequest())).json();
    expect(legacyBody.atlas.imports).toEqual([{ id: "legacy", receipt: { version: 1 } }]);
    expect(legacyBody.atlas.updates.map((update: { id: string }) => update.id))
      .toEqual(["legacy-update", "accepted"]);

    const currentBody = await (await GET(persistentSuggestionRequest())).json();
    expect(currentBody.atlas.imports).toHaveLength(2);
    expect(currentBody.atlas.updates).toHaveLength(3);
  });

  it("erases only after an explicit confirmation", async () => {
    const { DELETE } = await import("./route");
    const rejected = await DELETE(new Request("https://example.test/api/almanac", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "erase" }),
    }));
    expect(rejected.status).toBe(400);
    expect(mocks.eraseAlmanac).not.toHaveBeenCalled();

    const accepted = await DELETE(new Request("https://example.test/api/almanac", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "ERASE" }),
    }));
    expect(accepted.status).toBe(200);
    expect(mocks.eraseAlmanac).toHaveBeenCalledWith("user-a");
  });
});
