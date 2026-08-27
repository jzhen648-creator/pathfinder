import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAuthRateLimitStore } from "@/lib/auth-rate-limit";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), deleteAccount: vi.fn() }));

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => mocks.requireUser(...args),
}));
vi.mock("@/lib/account-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account-data")>();
  return { ...actual, deleteAccountForUser: (...args: unknown[]) => mocks.deleteAccount(...args) };
});

function request(body: unknown): Request {
  return new Request("https://example.test/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/account", () => {
  beforeEach(() => {
    __resetAuthRateLimitStore();
    mocks.requireUser.mockResolvedValue({ ok: true, userId: "user-a" });
    mocks.deleteAccount.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { DELETE } = await import("./route");
    expect((await DELETE(request({ password: "correct horse" }))).status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a password and deletes only the authenticated account", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(request({ password: "" }))).status).toBe(400);

    const response = await DELETE(request({ password: "correct horse" }));
    expect(response.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledWith("user-a", "correct horse");
  });

  it("returns a generic reauthentication failure", async () => {
    const { AccountPasswordError } = await import("@/lib/account-data");
    mocks.deleteAccount.mockRejectedValue(new AccountPasswordError());
    const { DELETE } = await import("./route");
    const response = await DELETE(request({ password: "wrong password" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Your password was not accepted." });
  });
});
