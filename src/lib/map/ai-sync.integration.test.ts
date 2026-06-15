import { beforeEach, describe, expect, it, vi } from "vitest";

import { runMapAiSync } from "@/lib/map/ai-sync";
import { MAX_GEMINI_CALLS_PER_SYNC } from "@/lib/map/sync-gemini-budget";
import { STORY_SCHEMA_VERSION } from "@/lib/story/story-types";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";

const USER_ID = "test-user";
const MAP_VERSION = "map-v1";
const MEMORY_VERSION = 1;

const mocks = vi.hoisted(() => ({
  countPendingCaptures: vi.fn(),
  digestPendingCapturesBounded: vi.fn(),
  refreshReadingCachesSmart: vi.fn(),
  runReflectSync: vi.fn(),
  isReflectCallEnabled: vi.fn(),
  computeMapVersion: vi.fn(),
  getMemoryVersion: vi.fn(),
  listReadingDirtySummary: vi.fn(),
  checkReadingDeliveryGate: vi.fn(),
  recordReadingDelivery: vi.fn(),
  flushDeferredMemoryUpdates: vi.fn(),
  discardDeferredMemoryUpdates: vi.fn(),
  markGlobalReadingDirty: vi.fn(),
  prismaUserFindUnique: vi.fn(),
  prismaInsightFindUnique: vi.fn(),
  prismaStoryFindUnique: vi.fn(),
  prismaAiReadingDirtyFindMany: vi.fn(),
}));

vi.mock("@/lib/stream-pursuit-apply", () => ({
  countPendingCaptures: mocks.countPendingCaptures,
  digestPendingCapturesBounded: mocks.digestPendingCapturesBounded,
}));

vi.mock("@/lib/map/incremental-reading-refresh", () => ({
  refreshReadingCachesSmart: mocks.refreshReadingCachesSmart,
}));

vi.mock("@/lib/ai/generate-reflect", () => ({
  isReflectCallEnabled: mocks.isReflectCallEnabled,
  runReflectSync: mocks.runReflectSync,
}));

vi.mock("@/lib/insights/compute-map-version", () => ({
  computeMapVersion: mocks.computeMapVersion,
  getMemoryVersion: mocks.getMemoryVersion,
}));

vi.mock("@/lib/map/reading-dirty-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/reading-dirty-ledger")>();
  return {
    ...actual,
    listReadingDirtySummary: mocks.listReadingDirtySummary,
    clearReadingDirtyLedger: vi.fn(),
    markGlobalReadingDirty: mocks.markGlobalReadingDirty,
  };
});

vi.mock("@/lib/map/reading-delivery-cadence", () => ({
  checkReadingDeliveryGate: mocks.checkReadingDeliveryGate,
  recordReadingDelivery: mocks.recordReadingDelivery,
}));

vi.mock("@/lib/memory/deferred-memory-updates", () => ({
  flushDeferredMemoryUpdates: mocks.flushDeferredMemoryUpdates,
  discardDeferredMemoryUpdates: mocks.discardDeferredMemoryUpdates,
}));

vi.mock("@/lib/gemini", () => ({
  hasGeminiKey: () => true,
  GeminiNotConfiguredError: class GeminiNotConfiguredError extends Error {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.prismaUserFindUnique,
    },
    insightCache: {
      findUnique: mocks.prismaInsightFindUnique,
      update: vi.fn(),
    },
    storyCache: {
      findUnique: mocks.prismaStoryFindUnique,
      update: vi.fn(),
    },
    aiReadingDirtyItem: {
      findMany: mocks.prismaAiReadingDirtyFindMany,
    },
  },
}));

function freshStoryPayload() {
  return JSON.stringify({
    schemaVersion: STORY_SCHEMA_VERSION,
    seasonRead: "Product Lead search is active.",
  });
}

function baseDirtySummary(overrides?: Partial<{
  pursuitIds: string[];
  totalItems: number;
}>) {
  return {
    pursuitIds: overrides?.pursuitIds ?? [],
    themeIds: [] as string[],
    hubIds: [] as string[],
    markIds: [] as string[],
    hasGlobal: false,
    totalItems: overrides?.totalItems ?? 0,
  };
}

function setupFreshCaches() {
  mocks.computeMapVersion.mockResolvedValue(MAP_VERSION);
  mocks.getMemoryVersion.mockResolvedValue(MEMORY_VERSION);
  mocks.prismaUserFindUnique.mockResolvedValue({ taxonomyVersion: TAXONOMY_VERSION });
  mocks.prismaInsightFindUnique.mockResolvedValue({
    mapVersion: MAP_VERSION,
    memoryVersion: MEMORY_VERSION,
    globalInsight: JSON.stringify({ greeting: "", sections: [] }),
    themeInsights: "{}",
    hubInsights: "{}",
    pursuitInsights: "{}",
    generatedAt: new Date(),
  });
    mocks.prismaStoryFindUnique.mockResolvedValue({
      mapVersion: MAP_VERSION,
      memoryVersion: MEMORY_VERSION,
      payload: freshStoryPayload(),
      generatedAt: new Date(),
    });
    mocks.prismaAiReadingDirtyFindMany.mockResolvedValue([]);
  mocks.checkReadingDeliveryGate.mockResolvedValue({
    allowed: true,
    retryAfterMs: 0,
    lastDeliveredAt: null,
    intervalMs: 0,
  });
  mocks.flushDeferredMemoryUpdates.mockResolvedValue(undefined);
  mocks.recordReadingDelivery.mockResolvedValue(undefined);
}

describe("runMapAiSync integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFreshCaches();
    mocks.isReflectCallEnabled.mockReturnValue(false);
    mocks.countPendingCaptures.mockResolvedValue(0);
    mocks.listReadingDirtySummary.mockResolvedValue(baseDirtySummary());
    mocks.digestPendingCapturesBounded.mockResolvedValue({
      processed: 0,
      failed: 0,
      errors: [],
      rateLimited: false,
      remaining: 0,
      memoryTextsDeferred: 0,
      geminiCallsMade: 0,
    });
    mocks.refreshReadingCachesSmart.mockResolvedValue({
      insightsRefreshed: false,
      storyRefreshed: false,
      insightsPruned: false,
      fullRefresh: false,
      incrementalRefresh: false,
      backfillCalls: 0,
      geminiRateLimited: false,
    });
    mocks.runReflectSync.mockImplementation(
      async (
        _userId: string,
        _mapVersion: string,
        _memoryVersion: number,
        options: { metrics: { aiCallsCompleted: number; reflectCall: boolean } },
      ) => {
        options.metrics.aiCallsCompleted = 1;
        options.metrics.reflectCall = true;
        return {
          insightsRefreshed: false,
          storyRefreshed: false,
          geminiRateLimited: false,
        };
      },
    );
  });

  it("skips digest on enrich-only Finish tap when caches are fresh", async () => {
    mocks.countPendingCaptures.mockResolvedValue(2);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1"], totalItems: 1 }),
    );
    mocks.refreshReadingCachesSmart.mockImplementation(
      async (
        _userId: string,
        _mapVersion: string,
        _memoryVersion: number,
        options: { metrics: { aiCallsCompleted: number } },
      ) => {
        options.metrics.aiCallsCompleted = 1;
        return {
          insightsRefreshed: true,
          storyRefreshed: false,
          insightsPruned: false,
          fullRefresh: false,
          incrementalRefresh: true,
          backfillCalls: 0,
          geminiRateLimited: false,
        };
      },
    );
    mocks.prismaInsightFindUnique.mockResolvedValue({
      mapVersion: MAP_VERSION,
      memoryVersion: MEMORY_VERSION,
      globalInsight: JSON.stringify({ greeting: "Hi", sections: [] }),
      themeInsights: "{}",
      hubInsights: "{}",
      pursuitInsights: "{}",
      generatedAt: new Date(),
    });

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.digestPendingCapturesBounded).not.toHaveBeenCalled();
    expect(mocks.refreshReadingCachesSmart).toHaveBeenCalled();
    expect(result.metrics.aiCallsCompleted).toBeLessThanOrEqual(MAX_GEMINI_CALLS_PER_SYNC);
    expect(result.metrics.digestRunsRemaining).toBe(2);
  });

  it("caps digest Gemini calls at remaining unified budget", async () => {
    mocks.countPendingCaptures.mockResolvedValue(3);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1"], totalItems: 2 }),
    );
    mocks.digestPendingCapturesBounded.mockResolvedValue({
      processed: 2,
      failed: 0,
      errors: [],
      rateLimited: false,
      remaining: 1,
      memoryTextsDeferred: 2,
      geminiCallsMade: 2,
    });
    mocks.refreshReadingCachesSmart.mockResolvedValue({
      insightsRefreshed: false,
      storyRefreshed: true,
      insightsPruned: false,
      fullRefresh: false,
      incrementalRefresh: true,
      backfillCalls: 0,
      geminiRateLimited: false,
    });
    mocks.prismaStoryFindUnique
      .mockResolvedValueOnce({
        mapVersion: "stale",
        memoryVersion: MEMORY_VERSION,
        payload: freshStoryPayload(),
        generatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        mapVersion: MAP_VERSION,
        memoryVersion: MEMORY_VERSION,
        payload: freshStoryPayload(),
        generatedAt: new Date(),
      });

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.digestPendingCapturesBounded).toHaveBeenCalledWith(USER_ID, {
      maxGeminiCalls: MAX_GEMINI_CALLS_PER_SYNC,
    });
    expect(result.metrics.aiCallsCompleted).toBeLessThanOrEqual(MAX_GEMINI_CALLS_PER_SYNC);
    expect(result.metrics.digestRunsProcessed).toBe(2);
  });

  it("uses reflect path with one Gemini call when USE_REFLECT_CALL is on", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.countPendingCaptures.mockResolvedValue(2);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1", "p2"], totalItems: 2 }),
    );

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.digestPendingCapturesBounded).not.toHaveBeenCalled();
    expect(mocks.refreshReadingCachesSmart).not.toHaveBeenCalled();
    expect(mocks.runReflectSync).toHaveBeenCalled();
    expect(result.metrics.aiCallsCompleted).toBe(1);
    expect(result.metrics.reflectCall).toBe(true);
    expect(result.metrics.digestRunsRemaining).toBe(0);
  });

  it("reflect on with zero pending StreamRuns skips digest", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.countPendingCaptures.mockResolvedValue(0);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1"], totalItems: 1 }),
    );

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.digestPendingCapturesBounded).not.toHaveBeenCalled();
    expect(mocks.runReflectSync).toHaveBeenCalled();
    expect(result.metrics.digestRunsRemaining).toBe(0);
  });

  it("legacy path with zero pending StreamRuns never runs digest", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(false);
    mocks.countPendingCaptures.mockResolvedValue(0);

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.digestPendingCapturesBounded).not.toHaveBeenCalled();
    expect(result.metrics.digestRunsProcessed).toBe(0);
    expect(result.metrics.digestRunsRemaining).toBe(0);
  });

  it("makes zero Gemini calls on rapid create with fresh caches and empty dirty ledger", async () => {
    const result = await runMapAiSync(USER_ID);

    expect(mocks.digestPendingCapturesBounded).not.toHaveBeenCalled();
    expect(mocks.refreshReadingCachesSmart).not.toHaveBeenCalled();
    expect(mocks.runReflectSync).not.toHaveBeenCalled();
    expect(result.metrics.aiCallsCompleted).toBe(0);
  });

  it("clean map + force skips reflect with 0 calls", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.prismaInsightFindUnique.mockResolvedValue({
      mapVersion: "stale-map",
      memoryVersion: MEMORY_VERSION,
      globalInsight: JSON.stringify({ greeting: "", sections: [] }),
      themeInsights: "{}",
      hubInsights: "{}",
      pursuitInsights: "{}",
      generatedAt: new Date(),
    });
    mocks.runReflectSync.mockResolvedValue({
      skipped: true,
      insightsRefreshed: false,
      storyRefreshed: false,
      geminiCallsMade: 0,
      geminiRateLimited: false,
    });

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalledTimes(1);
    expect(result.metrics.aiCallsCompleted).toBe(0);
    expect(result.skipped).toBe(true);
  });

  it("single Update tap invokes reflect once for dirty + stale story", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.countPendingCaptures.mockResolvedValue(0);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1", "p2"], totalItems: 2 }),
    );
    mocks.prismaStoryFindUnique.mockResolvedValue({
      mapVersion: "stale",
      memoryVersion: MEMORY_VERSION,
      payload: freshStoryPayload(),
      generatedAt: new Date(),
    });

    await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalledTimes(1);
    expect(mocks.refreshReadingCachesSmart).not.toHaveBeenCalled();
  });
});
