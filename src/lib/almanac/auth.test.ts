import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), findUser: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireSession(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mocks.findUser(...args) } },
}));

describe("persisted Almanac signed-in gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("preserves the existing 401 for a signed-out caller", async () => {
    mocks.requireSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { requireAlmanacDogfoodUser } = await import("./auth");
    const result = await requireAlmanacDogfoodUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("rejects an authenticated anonymous guest", async () => {
    mocks.requireSession.mockResolvedValue({ ok: true, userId: "guest-a" });
    mocks.findUser.mockResolvedValue({ id: "guest-a", isAnonymous: true });
    const { requireAlmanacDogfoodUser } = await import("./auth");
    const result = await requireAlmanacDogfoodUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns only the server-authenticated non-guest user ID", async () => {
    mocks.requireSession.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.findUser.mockResolvedValue({ id: "user-a", isAnonymous: false });
    const { requireAlmanacDogfoodUser } = await import("./auth");
    await expect(requireAlmanacDogfoodUser()).resolves.toEqual({ ok: true, userId: "user-a" });
  });
});
