import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAuthRateLimitStore } from "@/lib/auth-rate-limit";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
  requireSecret: vi.fn(),
  buildResponse: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: mocks.findFirst, create: mocks.create } },
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/mobile-auth", () => ({
  requireAuthSecret: () => mocks.requireSecret(),
  buildMobileAuthResponse: (...args: unknown[]) => mocks.buildResponse(...args),
}));
vi.mock("@/lib/telemetry/beta-usage", () => ({
  recordBetaUsageEvents: (...args: unknown[]) => mocks.recordUsage(...args),
}));

function request(body: unknown): Request {
  return new Request("https://example.test/api/auth/mobile-register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/mobile-register", () => {
  beforeEach(() => {
    __resetAuthRateLimitStore();
    mocks.requireSecret.mockReturnValue("test-secret");
    mocks.findFirst.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.create.mockResolvedValue({
      id: "user-a",
      name: "Jeremy",
      email: "jeremy@example.com",
      passwordHash: "hashed-password",
      isAnonymous: false,
      onboardingCompleted: false,
    });
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.buildResponse.mockResolvedValue({
      token: "signed-token",
      user: {
        id: "user-a",
        name: "Jeremy",
        email: "jeremy@example.com",
        onboardingCompleted: false,
        isAnonymous: false,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates an empty claimed account with normalised identity and returns a session", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      name: "  Jeremy  ",
      email: "  JEREMY@Example.com  ",
      password: "correct horse",
    }));

    expect(response.status).toBe(201);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "jeremy@example.com", mode: "insensitive" } },
      select: { id: true },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        name: "Jeremy",
        email: "jeremy@example.com",
        passwordHash: "hashed-password",
        isAnonymous: false,
        onboardingCompleted: false,
      },
    });
    expect(await response.json()).toEqual(expect.objectContaining({ token: "signed-token" }));
  });

  it("rejects an existing mailbox regardless of casing", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing" });
    const { POST } = await import("./route");
    const response = await POST(request({
      name: "Jeremy",
      email: "jeremy@example.com",
      password: "correct horse",
    }));

    expect(response.status).toBe(409);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("maps the concurrent unique-email race to the same duplicate response", async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    const { POST } = await import("./route");
    const response = await POST(request({
      name: "Jeremy",
      email: "jeremy@example.com",
      password: "correct horse",
    }));
    expect(response.status).toBe(409);
  });

  it("rejects short passwords before hashing", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      name: "Jeremy",
      email: "jeremy@example.com",
      password: "short",
    }));
    expect(response.status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
  });
});
