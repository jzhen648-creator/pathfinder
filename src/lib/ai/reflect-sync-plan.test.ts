import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import { planReflectWork } from "@/lib/ai/reflect-sync-plan";

const mocks = vi.hoisted(() => ({
  goalFindMany: vi.fn(),
  insightFindUnique: vi.fn(),
  formatMapContext: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: { findMany: mocks.goalFindMany },
    insightCache: { findUnique: mocks.insightFindUnique },
  },
}));

vi.mock("@/lib/ai/format-map-context", () => ({
  formatMapContext: mocks.formatMapContext,
}));

const USER_ID = "user-1";

function emptyDirty(): ReadingDirtyAnalysis {
  return {
    pursuitIds: [],
    themeIds: [],
    hasGlobal: false,
    totalItems: 0,
    hasPursuitArchivedReason: false,
    staleDirtyPursuitIds: [],
    activeDirtyPursuitIds: [],
  };
}

describe("planReflectWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatMapContext.mockResolvedValue({
      themes: [{ id: "work", hubs: [{ pursuits: [{ id: "p1" }] }] }],
    });
  });

  it("skips when force is true but reading and panels are fresh", async () => {
    mocks.goalFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        p1: { tone: "in_focus", headline: "One", body: "Body" },
        p2: { tone: "in_focus", headline: "Two", body: "Body" },
      },
    });

    const plan = await planReflectWork(USER_ID, emptyDirty(), {
      force: true,
      insightsStale: false,
    });

    expect(plan.mode).toBe("skip");
    expect(plan.pursuitIds).toEqual([]);
  });

  it("repairs only missing pursuit panels on force", async () => {
    mocks.goalFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        p1: { tone: "in_focus", headline: "One", body: "Body" },
      },
    });

    const plan = await planReflectWork(USER_ID, emptyDirty(), {
      force: true,
      insightsStale: false,
    });

    expect(plan.mode).toBe("panels-only");
    expect(plan.pursuitIds).toEqual(["p2", "p3"]);
    expect(plan.themeIds).toEqual([]);
  });

  it("uses dirty pursuits when the ledger has active edits", async () => {
    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      themeIds: ["finance"],
      totalItems: 1,
      pursuitIds: ["p9"],
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: false,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.pursuitIds).toEqual(["p9"]);
    expect(plan.themeIds).toEqual(["finance"]);
  });
});
