import { describe, expect, it, vi } from "vitest";
import {
  captureAtlasPlacementsForMerge,
  restoreAtlasPlacementsAfterMerge,
} from "./merge-atlas-placements";

describe("Atlas placement account merge", () => {
  it("captures and removes guest placements before Chapters change owner", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const db = {
      atlasPlacement: {
        findMany: vi.fn(async () => [
          {
            goalId: "guest-goal",
            slot: 0,
            hiddenAt: null,
            focusedAt: createdAt,
            version: 2,
            createdAt,
          },
        ]),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    const captured = await captureAtlasPlacementsForMerge(
      db as never,
      "guest-user",
    );

    expect(captured).toHaveLength(1);
    expect(db.atlasPlacement.deleteMany).toHaveBeenCalledWith({
      where: { userId: "guest-user" },
    });
  });

  it("preserves free slots and deterministically reassigns collisions", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const db = {
      atlasPlacement: {
        findMany: vi.fn(async () => [{ slot: 0 }]),
        createMany: vi.fn(async () => ({ count: 2 })),
      },
    };

    await restoreAtlasPlacementsAfterMerge(db as never, "account-user", [
      {
        goalId: "colliding-goal",
        slot: 0,
        hiddenAt: null,
        focusedAt: createdAt,
        version: 3,
        createdAt,
      },
      {
        goalId: "free-goal",
        slot: 14,
        hiddenAt: createdAt,
        focusedAt: null,
        version: 1,
        createdAt,
      },
    ]);

    expect(db.atlasPlacement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          goalId: "colliding-goal",
          userId: "account-user",
          slot: 8,
          focusedAt: createdAt,
          version: 3,
        }),
        expect.objectContaining({
          goalId: "free-goal",
          userId: "account-user",
          slot: 14,
          hiddenAt: createdAt,
        }),
      ],
    });
  });

  it("leaves overflow Chapters in the Index when all 64 slots are occupied", async () => {
    const db = {
      atlasPlacement: {
        findMany: vi.fn(async () =>
          Array.from({ length: 64 }, (_, slot) => ({ slot })),
        ),
        createMany: vi.fn(async () => ({ count: 0 })),
      },
    };

    await restoreAtlasPlacementsAfterMerge(db as never, "account-user", [
      {
        goalId: "overflow-goal",
        slot: 0,
        hiddenAt: null,
        focusedAt: null,
        version: 1,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    expect(db.atlasPlacement.createMany).not.toHaveBeenCalled();
  });
});
