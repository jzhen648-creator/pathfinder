import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import { planReflectWork } from "@/lib/ai/reflect-sync-plan";

const mocks = vi.hoisted(() => ({
  goalFindMany: vi.fn(),
  goalCount: vi.fn(),
  insightFindUnique: vi.fn(),
  formatMapContext: vi.fn(),
  dirtyFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: { findMany: mocks.goalFindMany, count: mocks.goalCount },
    insightCache: { findUnique: mocks.insightFindUnique },
    aiReadingDirtyItem: { findMany: mocks.dirtyFindMany },
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
      themes: [{ id: "work", categories: [{ pursuits: [{ id: "p1" }] }] }],
    });
    mocks.dirtyFindMany.mockResolvedValue([]);
    mocks.goalCount.mockResolvedValue(12);
  });

  it("runs full refresh when force is true even if reading and panels are fresh", async () => {
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

    expect(plan.mode).toBe("full");
    expect(plan.pursuitIds).toEqual(["p1", "p2"]);
    expect(plan.themeIds).toEqual(["work"]);
  });

  it("repairs only missing pursuit panels when not forced", async () => {
    mocks.goalFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        p1: { tone: "in_focus", headline: "One", body: "Body" },
      },
    });

    const plan = await planReflectWork(USER_ID, emptyDirty(), {
      force: false,
      insightsStale: false,
      hasInsightCache: true,
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

  it("runs full refresh when force is true even with dirty pursuits on the ledger", async () => {
    mocks.goalFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      themeIds: [],
      totalItems: 2,
      pursuitIds: ["p9"],
      hasGlobal: true,
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: true,
      insightsStale: false,
    });

    expect(plan.mode).toBe("full");
    expect(plan.pursuitIds).toEqual(["p1", "p2"]);
    expect(plan.themeIds).toEqual(["work"]);
  });

  it("derives theme ids from dirty pursuits when the ledger has no theme rows", async () => {
    mocks.goalFindMany.mockResolvedValue([{ themeId: "health" }]);

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      themeIds: [],
      totalItems: 1,
      pursuitIds: ["p9"],
      hasGlobal: true,
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: false,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.pursuitIds).toEqual(["p9"]);
    expect(plan.themeIds).toEqual(["health"]);
  });

  it("prefers dirty incremental sync when insightsStale and ledger has active edits", async () => {
    mocks.dirtyFindMany.mockResolvedValue([{ reason: "pursuit_updated" }]);
    mocks.insightFindUnique.mockResolvedValue({
      themeInsights: {
        health: {
          tone: "encouraging",
          oneLiner: "Health is active.",
          reflective: "",
          contextual: "",
          combined: "",
        },
      },
    });

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      themeIds: [],
      totalItems: 2,
      pursuitIds: ["p9"],
      hasGlobal: true,
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: true,
      hasInsightCache: true,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.pursuitIds).toEqual(["p9"]);
    expect(plan.themeIds).toEqual([]);
  });

  it("skips theme synthesis for edit-only dirty batches when theme insight exists", async () => {
    mocks.dirtyFindMany.mockResolvedValue([{ reason: "pursuit_updated" }]);
    mocks.goalFindMany.mockResolvedValue([{ themeId: "health" }]);
    mocks.insightFindUnique.mockResolvedValue({
      themeInsights: {
        health: {
          tone: "encouraging",
          oneLiner: "Health is active.",
          reflective: "",
          contextual: "",
          combined: "",
        },
      },
    });

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      totalItems: 1,
      pursuitIds: ["p9"],
      hasGlobal: true,
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: true,
      hasInsightCache: true,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.themeIds).toEqual([]);
  });

  it("includes missing theme ids for edit-only dirty batches", async () => {
    mocks.dirtyFindMany.mockResolvedValue([{ reason: "pursuit_updated" }]);
    mocks.goalFindMany.mockResolvedValue([{ themeId: "finance" }]);
    mocks.insightFindUnique.mockResolvedValue({
      themeInsights: {
        work: {
          tone: "encouraging",
          oneLiner: "Work is active.",
          reflective: "",
          contextual: "",
          combined: "",
        },
      },
    });

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p-finance"],
      totalItems: 1,
      pursuitIds: ["p-finance"],
      hasGlobal: true,
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: false,
      hasInsightCache: true,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.pursuitIds).toEqual(["p-finance"]);
    expect(plan.themeIds).toEqual(["finance"]);
  });

  it("repairs missing theme insights when the ledger is clean", async () => {
    mocks.goalFindMany.mockImplementation((args: { where?: { themeId?: { in?: string[] } } }) => {
      if (args?.where?.themeId?.in) {
        return Promise.resolve([{ id: "p-finance" }]);
      }
      return Promise.resolve([{ id: "p-finance" }, { id: "p-work" }]);
    });
    mocks.formatMapContext.mockResolvedValue({
      themes: [
        { id: "work", categories: [{ pursuits: [{ id: "p-work" }] }] },
        { id: "finance", categories: [{ pursuits: [{ id: "p-finance" }] }] },
      ],
    });
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        "p-finance": { tone: "in_focus", headline: "ISA", body: "Body" },
        "p-work": { tone: "in_focus", headline: "Apprenticeship", body: "Body" },
      },
      themeInsights: {
        work: {
          tone: "encouraging",
          oneLiner: "Work is active.",
          reflective: "",
          contextual: "",
          combined: "",
        },
      },
    });

    const plan = await planReflectWork(USER_ID, emptyDirty(), {
      force: false,
      insightsStale: false,
      hasInsightCache: true,
    });

    expect(plan.mode).toBe("dirty");
    expect(plan.pursuitIds).toEqual(["p-finance"]);
    expect(plan.themeIds).toEqual(["finance"]);
  });

  it("runs full refresh when pursuit archive is on the ledger", async () => {
    mocks.goalFindMany.mockResolvedValue([{ id: "p1" }]);

    const dirty: ReadingDirtyAnalysis = {
      ...emptyDirty(),
      activeDirtyPursuitIds: ["p9"],
      hasPursuitArchivedReason: true,
      totalItems: 2,
      pursuitIds: ["p9"],
    };

    const plan = await planReflectWork(USER_ID, dirty, {
      force: false,
      insightsStale: false,
      hasInsightCache: true,
    });

    expect(plan.mode).toBe("full");
  });
});
