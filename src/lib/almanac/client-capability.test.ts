import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    almanacImport: { findFirst: (...args: unknown[]) => mocks.findFirst(...args) },
  },
}));

import {
  ALMANAC_CAPABILITIES_HEADER,
  almanacUserEntryCapabilityGuard,
  almanacUserEntrySafeJson,
} from "@/lib/almanac/client-capability";

describe("Almanac user-entry client capability", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.findFirst.mockResolvedValue(null);
  });

  it("lets a capable client receive truthful direct provenance without a lookup", async () => {
    const request = new Request("https://example.test/api/almanac", {
      headers: { [ALMANAC_CAPABILITIES_HEADER]: "other-v1, user-entry-v1" },
    });

    expect(await almanacUserEntryCapabilityGuard(request, "user-a")).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("keeps a legacy client working while the owner has no direct source", async () => {
    const request = new Request("https://example.test/api/almanac");

    expect(await almanacUserEntryCapabilityGuard(request, "user-a")).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-a", scope: "DIRECT" },
      select: { id: true },
    });
  });

  it("fails closed instead of exposing a direct source to a legacy client", async () => {
    mocks.findFirst.mockResolvedValue({ id: "direct-source" });
    const response = await almanacUserEntryCapabilityGuard(
      new Request("https://example.test/api/almanac"),
      "user-a",
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      error: "Update Almanac to view this record.",
      code: "ALMANAC_CLIENT_UPGRADE_REQUIRED",
    });
  });

  it("requires the capability before any direct write", async () => {
    const response = await almanacUserEntryCapabilityGuard(
      new Request("https://example.test/api/almanac/subjects/subject-a/updates"),
      "user-a",
      { directWrite: true },
    );

    expect(response?.status).toBe(409);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("re-checks the boundary immediately before serialising a response", async () => {
    mocks.findFirst.mockResolvedValue({ id: "concurrently-created-direct-source" });

    const response = await almanacUserEntrySafeJson(
      new Request("https://example.test/api/almanac"),
      "user-a",
      { atlas: { imports: [] } },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "ALMANAC_CLIENT_UPGRADE_REQUIRED",
    });
  });

  it("rejects a direct-bearing body even if the live source was erased before postflight", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await almanacUserEntrySafeJson(
      new Request("https://example.test/api/almanac"),
      "user-a",
      {
        atlas: {
          imports: [{ protocolVersion: "ALMANAC/USER/1", scope: "direct", originKind: "USER_ENTRY" }],
        },
      },
    );

    expect(response.status).toBe(409);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: "ALMANAC_CLIENT_UPGRADE_REQUIRED",
    });
  });

  it("lets a capable client receive a direct-bearing body", async () => {
    const response = await almanacUserEntrySafeJson(
      new Request("https://example.test/api/almanac", {
        headers: { [ALMANAC_CAPABILITIES_HEADER]: "user-entry-v1" },
      }),
      "user-a",
      { scope: "direct", originKind: "USER_ENTRY" },
    );

    expect(response.status).toBe(200);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
