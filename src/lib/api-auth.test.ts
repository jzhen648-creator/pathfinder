import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  decode: vi.fn(),
  getToken: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: () => mocks.headers() }));
vi.mock("next-auth/jwt", () => ({
  decode: (...args: unknown[]) => mocks.decode(...args),
  getToken: (...args: unknown[]) => mocks.getToken(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mocks.findUser(...args) } },
}));

describe("requireApiSessionUserId", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    mocks.headers.mockResolvedValue(new Headers({ authorization: "Bearer signed-token" }));
    mocks.decode.mockResolvedValue({ sub: "user-a" });
    mocks.getToken.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({ id: "user-a" });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts a valid token only while its account still exists", async () => {
    const { requireApiSessionUserId } = await import("./api-auth");
    await expect(requireApiSessionUserId()).resolves.toEqual({ ok: true, userId: "user-a" });
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "user-a" },
      select: { id: true },
    });
  });

  it("rejects a previously valid token after its account is deleted", async () => {
    mocks.findUser.mockResolvedValue(null);
    const { requireApiSessionUserId } = await import("./api-auth");
    const result = await requireApiSessionUserId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("fails closed when account existence cannot be verified", async () => {
    mocks.findUser.mockRejectedValue(new Error("database unavailable"));
    const { requireApiSessionUserId } = await import("./api-auth");
    const result = await requireApiSessionUserId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
