import { beforeEach, describe, expect, it, vi } from "vitest";

import { runMapAiSync } from "@/lib/map/ai-sync";
import { composeInsightCacheMapVersion } from "@/lib/insights/reflect-prompt-version";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";

const USER_ID = "test-user";
const MAP_VERSION = "map-v1";
const MEMORY_VERSION = 1;

const mocks = vi.hoisted(() => ({
  runReflectSync: vi.fn(),
  isReflectCallEnabled: vi.fn(),
  computeMapVersion: vi.fn(),
  getMemoryVersion: vi.fn(),
  listReadingDirtySummary: vi.fn(),
  checkReadingDeliveryGate: vi.fn(),
  recordReadingDelivery: vi.fn(),
  markGlobalReadingDirty: vi.fn(),
  prismaUserFindUnique: vi.fn(),
  prismaInsightFindUnique: vi.fn(),
  prismaAiReadingDirtyFindMany: vi.fn(),
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
    aiReadingDirtyItem: {
      findMany: mocks.prismaAiReadingDirtyFindMany,
    },
  },
}));

function baseDirtySummary(overrides?: Partial<{
  pursuitIds: string[];
  totalItems: number;
}>) {
  return {
    pursuitIds: overrides?.pursuitIds ?? [],
    themeIds: [] as string[],
    hasGlobal: false,
    totalItems: overrides?.totalItems ?? 0,
  };
}

function setupFreshCaches() {
  mocks.computeMapVersion.mockResolvedValue(MAP_VERSION);
  mocks.getMemoryVersion.mockResolvedValue(MEMORY_VERSION);
  mocks.prismaUserFindUnique.mockResolvedValue({ taxonomyVersion: TAXONOMY_VERSION });
  mocks.prismaInsightFindUnique.mockResolvedValue({
    mapVersion: composeInsightCacheMapVersion(MAP_VERSION),
    memoryVersion: MEMORY_VERSION,
    globalInsight: JSON.stringify({ greeting: "", sections: [] }),
    themeInsights: "{}",
    categoryInsights: "{}",
    pursuitInsights: "{}",
    generatedAt: new Date(),
  });
  mocks.prismaAiReadingDirtyFindMany.mockResolvedValue([]);
  mocks.checkReadingDeliveryGate.mockResolvedValue({
    allowed: true,
    retryAfterMs: 0,
    lastDeliveredAt: null,
    intervalMs: 0,
  });
  mocks.recordReadingDelivery.mockResolvedValue(undefined);
}

describe("runMapAiSync integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFreshCaches();
    mocks.isReflectCallEnabled.mockReturnValue(false);
    mocks.listReadingDirtySummary.mockResolvedValue(baseDirtySummary());
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
          geminiRateLimited: false,
        };
      },
    );
  });

  it("skips sync when reflect is disabled even with dirty ledger", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(false);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1"], totalItems: 1 }),
    );

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.metrics.aiCallsCompleted).toBe(0);
  });

  it("uses reflect path with one Gemini call when USE_REFLECT_CALL is on", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1", "p2"], totalItems: 2 }),
    );

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalled();
    expect(result.metrics.aiCallsCompleted).toBe(1);
    expect(result.metrics.reflectCall).toBe(true);
  });

  it("reflect mode runs sync for dirty pursuits", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1"], totalItems: 1 }),
    );

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalled();
  });

  it("reflect-disabled path with fresh caches and empty dirty ledger skips work", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(false);

    const result = await runMapAiSync(USER_ID, { force: false });

    expect(result.metrics.aiCallsCompleted).toBe(0);
  });

  it("makes zero Gemini calls on rapid create with fresh caches and empty dirty ledger", async () => {
    const result = await runMapAiSync(USER_ID);

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
      categoryInsights: "{}",
      pursuitInsights: "{}",
      generatedAt: new Date(),
    });
    mocks.runReflectSync.mockResolvedValue({
      skipped: true,
      insightsRefreshed: false,
      geminiCallsMade: 0,
      geminiRateLimited: false,
    });

    const result = await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalledTimes(1);
    expect(result.metrics.aiCallsCompleted).toBe(0);
    expect(result.skipped).toBe(true);
  });

  it("single Update tap invokes reflect once for dirty pursuits", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.listReadingDirtySummary.mockResolvedValue(
      baseDirtySummary({ pursuitIds: ["p1", "p2"], totalItems: 2 }),
    );

    await runMapAiSync(USER_ID, { force: true });

    expect(mocks.runReflectSync).toHaveBeenCalledTimes(1);
  });

  it("bypasses delivery gate when only reflect prompt version is stale", async () => {
    mocks.isReflectCallEnabled.mockReturnValue(true);
    mocks.prismaInsightFindUnique.mockResolvedValue({
      mapVersion: `${MAP_VERSION}:2026-01-01-old`,
      memoryVersion: MEMORY_VERSION,
      globalInsight: JSON.stringify({ greeting: "", sections: [] }),
      themeInsights: "{}",
      categoryInsights: "{}",
      pursuitInsights: "{}",
      generatedAt: new Date(),
    });
    mocks.checkReadingDeliveryGate.mockImplementation(
      (_userId: string, options?: { force?: boolean }) =>
        Promise.resolve({
          allowed: options?.force === true,
          retryAfterMs: options?.force === true ? 0 : 3_600_000,
          lastDeliveredAt: new Date(),
          intervalMs: 7_200_000,
        }),
    );
    mocks.runReflectSync.mockResolvedValue({
      skipped: false,
      insightsRefreshed: true,
      geminiRateLimited: false,
    });

    await runMapAiSync(USER_ID, { force: false });

    expect(mocks.checkReadingDeliveryGate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ force: true }),
    );
    expect(mocks.runReflectSync).toHaveBeenCalled();
  });
});
