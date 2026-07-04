import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FULL_REFRESH_INTERVAL_MS,
  isPeriodicFullRefreshDue,
  recordFullReflectDelivery,
} from "@/lib/map/reading-periodic-full-refresh";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

const USER_ID = "user-1";

describe("reading-periodic-full-refresh", () => {
  const originalInterval = process.env.AI_FULL_REFRESH_INTERVAL_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_FULL_REFRESH_INTERVAL_MS;
    mocks.userUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    if (originalInterval === undefined) {
      delete process.env.AI_FULL_REFRESH_INTERVAL_MS;
    } else {
      process.env.AI_FULL_REFRESH_INTERVAL_MS = originalInterval;
    }
  });

  it("is not due when interval env is 0 (disabled)", async () => {
    process.env.AI_FULL_REFRESH_INTERVAL_MS = "0";
    mocks.userFindUnique.mockResolvedValue({
      lastFullReflectAt: new Date(Date.now() - DEFAULT_FULL_REFRESH_INTERVAL_MS - 1000),
    });

    await expect(isPeriodicFullRefreshDue(USER_ID)).resolves.toBe(false);
  });

  it("is not due when lastFullReflectAt is null (initial full fill already ran)", async () => {
    mocks.userFindUnique.mockResolvedValue({ lastFullReflectAt: null });

    await expect(isPeriodicFullRefreshDue(USER_ID)).resolves.toBe(false);
  });

  it("is not due when interval has not elapsed", async () => {
    mocks.userFindUnique.mockResolvedValue({
      lastFullReflectAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(isPeriodicFullRefreshDue(USER_ID)).resolves.toBe(false);
  });

  it("is due when interval has elapsed", async () => {
    mocks.userFindUnique.mockResolvedValue({
      lastFullReflectAt: new Date(Date.now() - DEFAULT_FULL_REFRESH_INTERVAL_MS - 1000),
    });

    await expect(isPeriodicFullRefreshDue(USER_ID)).resolves.toBe(true);
  });

  it("respects custom interval from env", async () => {
    process.env.AI_FULL_REFRESH_INTERVAL_MS = String(60 * 60 * 1000);
    mocks.userFindUnique.mockResolvedValue({
      lastFullReflectAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await expect(isPeriodicFullRefreshDue(USER_ID)).resolves.toBe(true);
  });

  it("records lastFullReflectAt on delivery", async () => {
    await recordFullReflectDelivery(USER_ID);

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { lastFullReflectAt: expect.any(Date) },
    });
  });
});
