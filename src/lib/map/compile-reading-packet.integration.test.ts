import { beforeEach, describe, expect, it, vi } from "vitest";

import { compileReadingPacket } from "@/lib/map/compile-reading-packet";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import { DENSE_MAP_CONTEXT } from "@/lib/map/__fixtures__/dense-map";

const mocks = vi.hoisted(() => ({
  formatMapContext: vi.fn(),
  listReadingDirtyRows: vi.fn(),
  prismaGoalFindMany: vi.fn(),
}));

vi.mock("@/lib/ai/format-map-context", () => ({
  formatMapContext: mocks.formatMapContext,
}));

vi.mock("@/lib/map/reading-dirty-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/reading-dirty-ledger")>();
  return {
    ...actual,
    listReadingDirtyRows: mocks.listReadingDirtyRows,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: {
      findMany: mocks.prismaGoalFindMany,
    },
  },
}));

describe("compileReadingPacket excludeAbandoned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatMapContext.mockResolvedValue(DENSE_MAP_CONTEXT);
    mocks.listReadingDirtyRows.mockResolvedValue([]);
    mocks.prismaGoalFindMany.mockResolvedValue([{ categoryId: "cat-job" }]);
  });

  it("loads map context with excludeAbandoned so archived pursuits stay out of packet", async () => {
    const dirty: ReadingDirtyAnalysis = {
      pursuitIds: ["p-cemap"],
      themeIds: ["work"],
      hubIds: ["cat-job"],
      markIds: [],
      hasGlobal: false,
      totalItems: 1,
      hasPursuitArchivedReason: false,
      staleDirtyPursuitIds: [],
      activeDirtyPursuitIds: ["p-cemap"],
    };

    await compileReadingPacket("user-1", dirty);

    expect(mocks.formatMapContext).toHaveBeenCalledWith("user-1", { excludeAbandoned: true });
  });
});
