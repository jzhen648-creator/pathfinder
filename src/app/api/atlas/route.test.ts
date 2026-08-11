import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiSessionUserId: vi.fn(),
  loadAtlas: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireApiSessionUserId(...args),
}));
vi.mock("@/lib/atlas/load-atlas", () => ({
  loadAtlas: (...args: unknown[]) => mocks.loadAtlas(...args),
}));

describe("/api/atlas", () => {
  beforeEach(() => {
    mocks.requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    mocks.loadAtlas.mockResolvedValue({ chapters: [], backgroundCount: 0 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("requires authentication before loading", async () => {
    mocks.requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.loadAtlas).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's Atlas", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.loadAtlas).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual({ atlas: { chapters: [], backgroundCount: 0 } });
  });

  it("does not expose internal errors", async () => {
    mocks.loadAtlas.mockRejectedValue(new Error("private database details"));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load your Atlas. Please try again." });
  });
});
