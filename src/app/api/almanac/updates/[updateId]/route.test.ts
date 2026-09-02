import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/almanac/auth", () => ({
  requireAlmanacDogfoodUser: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/almanac/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/almanac/service")>();
  return { ...actual, updateAlmanacUpdatePreference: (...args: unknown[]) => mocks.update(...args) };
});

describe("PATCH /api/almanac/updates/[updateId]", () => {
  beforeEach(() => {
    vi.stubEnv("ALMANAC_PERSISTED_DOGFOOD_ENABLED", "1");
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.update.mockResolvedValue({
      updateId: "update-a",
      curation: { hidden: false, significance: "KEY", targetDate: null },
      atlas: {},
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function patch(body: unknown = { hidden: true }) {
    const { PATCH } = await import("./route");
    return PATCH(
      new Request("http://localhost/api/almanac/updates/update-a", {
        method: "PATCH",
        headers: { "X-Almanac-Capabilities": "user-entry-v1" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ updateId: "update-a" }) },
    );
  }

  it("uses the authenticated owner and rejects injected ownership", async () => {
    expect((await patch()).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("user-a", "update-a", { hidden: true });
    expect((await patch({ hidden: true, userId: "user-b" })).status).toBe(400);
  });

  it("accepts partial curation without resetting omitted fields", async () => {
    const body = {
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3 },
    };

    const response = await patch(body);

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("user-a", "update-a", {
      significance: "KEY",
      targetDate: { precision: "MONTH", year: 2027, month: 3, day: null },
    });
    expect(await response.json()).toEqual({
      updateId: "update-a",
      curation: { hidden: false, significance: "KEY", targetDate: null },
      atlas: {},
    });
  });

  it("rejects target dates without explicit precision", async () => {
    expect((await patch({ targetDate: { year: 2027, month: 3 } })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects signed-out users before changing visibility", async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await patch()).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
