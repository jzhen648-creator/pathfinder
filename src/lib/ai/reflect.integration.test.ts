import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runReflectSync } from "@/lib/ai/generate-reflect";
import {
  resetFakeProviderState,
  setFakeProviderFixture,
  setFakeProviderFixtureSequence,
} from "@/lib/ai/__fixtures__/fake-provider";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import {
  DENSE_MAP_CONTEXT,
  DENSE_READING_PACKET,
  DENSE_USER_CONTEXT,
} from "@/lib/map/__fixtures__/dense-map";

const USER_ID = "reflect-integration-user";
const MAP_VERSION = "map-v1";
const MEMORY_VERSION = 1;

const mocks = vi.hoisted(() => ({
  analyzeReadingDirty: vi.fn(),
  planReflectWork: vi.fn(),
  formatMapContext: vi.fn(),
  formatUserContext: vi.fn(),
  compileReadingPacket: vi.fn(),
  mergeNodeInsightsIntoCache: vi.fn(),
  clearReadingDirtyLedger: vi.fn(),
  prismaGoalFindMany: vi.fn(),
  prismaStoryFindUnique: vi.fn(),
  prismaStoryUpsert: vi.fn(),
}));

vi.mock("@/lib/map/reading-dirty-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/reading-dirty-ledger")>();
  return {
    ...actual,
    analyzeReadingDirty: mocks.analyzeReadingDirty,
    clearReadingDirtyLedger: mocks.clearReadingDirtyLedger,
  };
});

vi.mock("@/lib/ai/reflect-sync-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/reflect-sync-plan")>();
  return {
    ...actual,
    planReflectWork: mocks.planReflectWork,
  };
});

vi.mock("@/lib/ai/format-map-context", () => ({
  formatMapContext: mocks.formatMapContext,
}));

vi.mock("@/lib/ai/format-user-context", () => ({
  formatUserContext: mocks.formatUserContext,
}));

vi.mock("@/lib/map/compile-reading-packet", () => ({
  compileReadingPacket: mocks.compileReadingPacket,
  readingPacketToJson: (packet: unknown) => JSON.stringify(packet, null, 2),
}));

vi.mock("@/lib/insights/merge-insight-cache", () => ({
  mergeNodeInsightsIntoCache: mocks.mergeNodeInsightsIntoCache,
}));

vi.mock("@/lib/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    hasGeminiKey: () => true,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: {
      findMany: mocks.prismaGoalFindMany,
    },
    storyCache: {
      findUnique: mocks.prismaStoryFindUnique,
      upsert: mocks.prismaStoryUpsert,
    },
  },
}));

function pursuitSignal(id: string, overrides?: Partial<{
  description: string;
  enrichAnswerCount: number;
  milestoneCount: number;
}>) {
  return {
    id,
    title: `Pursuit ${id}`,
    description: overrides?.description ?? "Enough context for insight generation here.",
    enrichAnswers: null,
    deadline: new Date("2026-12-01"),
    status: "ACTIVE",
    targetAmount: null,
    milestones: [],
    ...(overrides?.enrichAnswerCount
      ? {
          enrichAnswers: Array.from({ length: overrides.enrichAnswerCount }, (_, i) => ({
            clarifierId: `q${i + 1}`,
            prompt: `Question ${i + 1}`,
            selectedOption: `Answer ${i + 1}`,
          })),
        }
      : {}),
  };
}

function goalRows(ids: string[]) {
  return ids.map((id) => pursuitSignal(id));
}

function baseDirty(pursuitIds: string[]): ReadingDirtyAnalysis {
  return {
    pursuitIds,
    themeIds: ["work"],
    hubIds: ["cat-job"],
    markIds: [],
    hasGlobal: false,
    totalItems: pursuitIds.length,
    hasPursuitArchivedReason: false,
    staleDirtyPursuitIds: [],
    activeDirtyPursuitIds: pursuitIds,
  };
}

describe("runReflectSync integration", () => {
  const originalReflect = process.env.USE_REFLECT_CALL;
  const originalFake = process.env.AI_FAKE_PROVIDER;

  beforeEach(() => {
    process.env.USE_REFLECT_CALL = "true";
    process.env.AI_FAKE_PROVIDER = "1";
    resetFakeProviderState();
    vi.clearAllMocks();

    mocks.formatMapContext.mockResolvedValue(DENSE_MAP_CONTEXT);
    mocks.formatUserContext.mockResolvedValue(DENSE_USER_CONTEXT);
    mocks.compileReadingPacket.mockResolvedValue(DENSE_READING_PACKET);
    mocks.mergeNodeInsightsIntoCache.mockResolvedValue(undefined);
    mocks.clearReadingDirtyLedger.mockResolvedValue(undefined);
    mocks.prismaStoryUpsert.mockResolvedValue(undefined);
    mocks.prismaStoryFindUnique.mockResolvedValue({
      payload: JSON.stringify({ schemaVersion: 1, seasonRead: "Previous reading." }),
    });
  });

  afterEach(() => {
    if (originalReflect === undefined) delete process.env.USE_REFLECT_CALL;
    else process.env.USE_REFLECT_CALL = originalReflect;
    if (originalFake === undefined) delete process.env.AI_FAKE_PROVIDER;
    else process.env.AI_FAKE_PROVIDER = originalFake;
    resetFakeProviderState();
  });

  it("skips with zero Gemini calls on clean map + force", async () => {
    mocks.analyzeReadingDirty.mockResolvedValue(baseDirty([]));
    mocks.planReflectWork.mockResolvedValue({
      mode: "skip",
      pursuitIds: [],
      themeIds: [],
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectSync(USER_ID, MAP_VERSION, MEMORY_VERSION, {
      force: true,
      storyStale: false,
      insightsStale: false,
      metrics,
    });

    expect(result.skipped).toBe(true);
    expect(result.geminiCallsMade).toBe(0);
    expect(metrics.aiCallsCompleted).toBe(0);
    expect(mocks.mergeNodeInsightsIntoCache).not.toHaveBeenCalled();
  });

  it("batch-1 panels survive batch-2 429", async () => {
    const batch1 = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const batch2 = ["p9", "p10"];
    const allIds = [...batch1, ...batch2];

    mocks.analyzeReadingDirty.mockResolvedValue(baseDirty(allIds));
    mocks.planReflectWork.mockResolvedValue({
      mode: "full",
      pursuitIds: allIds,
      themeIds: ["work"],
    });
    mocks.prismaGoalFindMany.mockResolvedValue(goalRows(allIds));
    setFakeProviderFixtureSequence(["fullReflect", "rateLimit429"]);

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectSync(USER_ID, MAP_VERSION, MEMORY_VERSION, {
      force: true,
      storyStale: true,
      insightsStale: true,
      metrics,
    });

    expect(result.geminiRateLimited).toBe(true);
    expect(result.insightsRefreshed).toBe(true);
    expect(metrics.rateLimited).toBe(true);
    expect(metrics.morePending).toBe(true);
    expect(metrics.pendingInsightCount).toBe(2);
    expect(metrics.aiCallsCompleted).toBe(1);
    expect(mocks.mergeNodeInsightsIntoCache).toHaveBeenCalled();
  });

  it("malformed JSON degrades without throwing", async () => {
    mocks.analyzeReadingDirty.mockResolvedValue(baseDirty(["p1"]));
    mocks.planReflectWork.mockResolvedValue({
      mode: "panels-only",
      pursuitIds: ["p1"],
      themeIds: [],
    });
    mocks.prismaGoalFindMany.mockResolvedValue(goalRows(["p1"]));
    setFakeProviderFixture("malformed");

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectSync(USER_ID, MAP_VERSION, MEMORY_VERSION, {
      force: true,
      storyStale: false,
      insightsStale: true,
      metrics,
    });

    expect(result.geminiRateLimited).toBe(false);
    expect(metrics.enrichErrors.length).toBeGreaterThan(0);
    expect(metrics.enrichErrors[0]).toContain("JSON");
  });
});
