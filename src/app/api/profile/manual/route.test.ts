import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { MINIMUM_AGE_YEARS } from "@/lib/profile/parse-manual-date-of-birth";

const requireApiSessionUserId = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireApiSessionUserId: (...args: unknown[]) => requireApiSessionUserId(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userManualProfile: {
      findUnique: vi.fn(),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

describe("PUT /api/profile/manual — dateOfBirth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
    requireApiSessionUserId.mockResolvedValue({ ok: true, userId: "user-1" });
    upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "profile-1",
      userId: "user-1",
      displayName: create.displayName ?? null,
      dateOfBirth: create.dateOfBirth ?? null,
      location: create.location ?? null,
      languages: create.languages ?? [],
      occupation: create.occupation ?? null,
      educationLevel: create.educationLevel ?? null,
      employmentStatus: create.employmentStatus ?? null,
      industry: create.industry ?? null,
      jobTitle: create.jobTitle ?? null,
      currencyCode: create.currencyCode ?? null,
      measurementSystem: create.measurementSystem ?? null,
      updatedAt: new Date(),
      createdAt: new Date(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function put(body: unknown) {
    const { PUT } = await import("./route");
    return PUT(
      new Request("http://localhost/api/profile/manual", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it(`returns 400 when dateOfBirth is under ${MINIMUM_AGE_YEARS}`, async () => {
    const res = await put({ dateOfBirth: "2020-01-01T00:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: `You must be at least ${MINIMUM_AGE_YEARS} years old.`,
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it(`accepts exactly ${MINIMUM_AGE_YEARS} years old`, async () => {
    const exactly13 = new Date("2026-07-30T12:00:00.000Z");
    exactly13.setFullYear(exactly13.getFullYear() - MINIMUM_AGE_YEARS);
    const res = await put({ dateOfBirth: exactly13.toISOString() });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0]![0] as {
      create: { dateOfBirth: Date | null };
    };
    expect(arg.create.dateOfBirth?.toISOString()).toBe(exactly13.toISOString());
  });

  it("clears dateOfBirth when null is sent", async () => {
    const res = await put({ dateOfBirth: null, displayName: "Ada" });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0]![0] as {
      create: { dateOfBirth: Date | null; displayName: string | null };
      update: { dateOfBirth: Date | null | undefined };
    };
    expect(arg.create.dateOfBirth).toBeNull();
    expect(arg.update.dateOfBirth).toBeNull();
  });

  it("leaves dateOfBirth unchanged when the field is omitted", async () => {
    const res = await put({ displayName: "Ada" });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0]![0] as {
      update: { dateOfBirth: Date | null | undefined; displayName: string | null };
    };
    expect(arg.update.dateOfBirth).toBeUndefined();
    expect(arg.update.displayName).toBe("Ada");
  });

  it("returns 401 when unauthenticated", async () => {
    requireApiSessionUserId.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await put({ displayName: "Ada" });
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
});
