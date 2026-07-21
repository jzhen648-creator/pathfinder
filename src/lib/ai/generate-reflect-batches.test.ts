import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReflectGenerationResponseError,
  runReflectBatchesIncremental,
  setGenerateReflectResponseDelegate,
} from "@/lib/ai/generate-reflect";
import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { applyReflectOutput } from "@/lib/ai/apply-reflect-output";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  clearReadingDirtyForPursuits,
  clearReadingDirtyLedgerBefore,
  type ReadingDirtyAnalysis,
} from "@/lib/map/reading-dirty-ledger";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import { MAX_REFLECT_CALLS_PER_SYNC } from "@/lib/map/sync-gemini-budget";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import { GeminiProviderError } from "@/lib/gemini";

vi.mock("@/lib/ai/apply-reflect-output", () => ({
  applyReflectOutput: vi.fn(),
}));

vi.mock("@/lib/map/reading-dirty-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/reading-dirty-ledger")>();
  return {
    ...actual,
    clearReadingDirtyForPursuits: vi.fn(),
    clearReadingDirtyLedgerBefore: vi.fn(),
  };
});

const USER_ID = "test-user";
const MAP_VERSION = "map-v1";
const MEMORY_VERSION = 1;

function pursuitIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p-${index + 1}`);
}

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

function emptyMapContext(): FormattedMapContext {
  return { themes: [] };
}

function batchOptions() {
  return {
    mapContext: emptyMapContext(),
    amountImpactEligible: false,
    holisticBenchmarkEligible: false,
    ledgerCutoff: new Date(),
  };
}

function mockReflectForBatch(batch: string[], includeThemes: boolean): ReflectResponse {
  const pursuits = Object.fromEntries(
    batch.map((id) => [
      id,
      {
        tone: "in_focus" as const,
        headline: `Headline ${id}`,
        body: "Body copy.",
      },
    ]),
  );
  return {
    pursuits,
    themes: includeThemes
      ? {
          work: {
            tone: "encouraging" as const,
            oneLiner: "Work theme",
            reflective: "Cross-pursuit dynamics.",
            contextual: "",
            combined: "",
          },
        }
      : {},
  };
}

describe("runReflectBatchesIncremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyReflectOutput).mockImplementation(async () => ({
      insightsWritten: true,
    }));
    vi.mocked(clearReadingDirtyForPursuits).mockResolvedValue(undefined);
    vi.mocked(clearReadingDirtyLedgerBefore).mockResolvedValue(undefined);
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) =>
      mockReflectForBatch(batch, options?.scope === "full"),
    );
  });

  afterEach(() => {
    setGenerateReflectResponseDelegate(null);
  });

  it("stops at MAX_REFLECT_CALLS_PER_SYNC on a large dirty set", async () => {
    const ids = pursuitIds(33);
    let callCount = 0;
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      callCount += 1;
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: ["work"], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(callCount).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(result.geminiCallsMade).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.aiCallsCompleted).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.aiCallsPlanned).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.morePending).toBe(true);
    expect(metrics.pendingInsightCount).toBe(1);
    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 32));
    expect(clearReadingDirtyLedgerBefore).not.toHaveBeenCalled();
    expect(result.insightsRefreshed).toBe(true);
  });

  it("keeps aiCallsPlanned aligned with completed calls when capped", async () => {
    const ids = pursuitIds(25);
    const metrics = emptyMapAiSyncMetrics();
    await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(metrics.aiCallsPlanned).toBe(metrics.aiCallsCompleted);
    expect(metrics.aiCallsPlanned).toBe(4);
    expect(clearReadingDirtyLedgerBefore).toHaveBeenCalledWith(USER_ID, expect.any(Date));
  });

  it("clears dirty ledger for completed pursuits only on cap-exhaust partial exit", async () => {
    const ids = pursuitIds(33);
    const metrics = emptyMapAiSyncMetrics();
    await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 32));
    expect(metrics.pendingInsightCount).toBe(1);
    expect(clearReadingDirtyLedgerBefore).not.toHaveBeenCalled();
  });

  it("uses full scope for batch 0 when themeIds are present", async () => {
    const ids = pursuitIds(3);
    const scopes: Array<string | undefined> = [];
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      scopes.push(options?.scope);
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: ["work"], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(scopes).toEqual(["full"]);
    expect(result.insightsRefreshed).toBe(true);
    expect(clearReadingDirtyLedgerBefore).toHaveBeenCalledWith(USER_ID, expect.any(Date));
  });

  it("uses pursuits-only scope for edit-only dirty batches without theme synthesis", async () => {
    const ids = pursuitIds(3);
    const scopes: Array<string | undefined> = [];
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      scopes.push(options?.scope);
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(scopes).toEqual(["pursuits-only"]);
    expect(metrics.incrementalRefresh).toBe(true);
    expect(metrics.fullRefresh).toBe(false);
  });

  it("clears completed pursuits when a later batch errors", async () => {
    const ids = pursuitIds(10);
    let callIndex = 0;
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      callIndex += 1;
      if (callIndex === 2) {
        throw new ReflectGenerationResponseError("Reflect call missing pursuit panel.");
      }
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(result.geminiCallsMade).toBe(1);
    expect(metrics.morePending).toBe(true);
    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 8));
    expect(clearReadingDirtyLedgerBefore).not.toHaveBeenCalled();
  });
});

describe("runReflectBatchesIncremental transient 503 retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(applyReflectOutput).mockImplementation(async () => ({
      insightsWritten: true,
    }));
    vi.mocked(clearReadingDirtyForPursuits).mockResolvedValue(undefined);
    vi.mocked(clearReadingDirtyLedgerBefore).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    setGenerateReflectResponseDelegate(null);
  });

  function transient503(): GeminiProviderError {
    return new GeminiProviderError("Gemini is temporarily unavailable. Try again later.", {
      status: 503,
    });
  }

  function rateLimit429(): GeminiProviderError {
    return new GeminiProviderError("Gemini quota or rate limit was exceeded. Try again later.", {
      status: 429,
    });
  }

  it("retries once when a batch 503s then succeeds on the retry", async () => {
    let callCount = 0;
    const ids = pursuitIds(3);
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      callCount += 1;
      if (callCount === 1) throw transient503();
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const resultPromise = runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: ["work"], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await resultPromise;

    expect(callCount).toBe(2);
    expect(result.geminiCallsMade).toBe(1);
    expect(metrics.aiCallsCompleted).toBe(1);
    expect(metrics.enrichErrors).toEqual([]);
    expect(clearReadingDirtyLedgerBefore).toHaveBeenCalledWith(USER_ID, expect.any(Date));
  });

  it("caps at one retry per sync when two batches hit transient 503", async () => {
    let callCount = 0;
    const ids = pursuitIds(10);
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      callCount += 1;
      if (callCount === 1) throw transient503();
      if (callCount === 2) return mockReflectForBatch(batch, options?.scope === "full");
      throw transient503();
    });

    const metrics = emptyMapAiSyncMetrics();
    const resultPromise = runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await resultPromise;

    expect(callCount).toBe(3);
    expect(result.geminiCallsMade).toBe(1);
    expect(metrics.aiCallsCompleted).toBe(1);
    expect(metrics.enrichErrors).toHaveLength(1);
    expect(metrics.enrichErrors[0]).toContain("temporarily unavailable");
    expect(metrics.morePending).toBe(true);
    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 8));
    expect(clearReadingDirtyLedgerBefore).not.toHaveBeenCalled();
  });

  it("does not retry on 429 rate limit", async () => {
    let callCount = 0;
    const ids = pursuitIds(3);
    setGenerateReflectResponseDelegate(async () => {
      callCount += 1;
      throw rateLimit429();
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );

    expect(callCount).toBe(1);
    expect(result.geminiRateLimited).toBe(true);
    expect(metrics.rateLimited).toBe(true);
    expect(metrics.aiCallsCompleted).toBe(0);
    expect(metrics.enrichErrors).toEqual([]);
  });

  it("soft-fails with enrichErrors when the transient retry also fails", async () => {
    let callCount = 0;
    const ids = pursuitIds(3);
    setGenerateReflectResponseDelegate(async () => {
      callCount += 1;
      throw transient503();
    });

    const metrics = emptyMapAiSyncMetrics();
    const resultPromise = runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await resultPromise;

    expect(callCount).toBe(2);
    expect(result.geminiCallsMade).toBe(0);
    expect(metrics.aiCallsCompleted).toBe(0);
    expect(metrics.enrichErrors).toHaveLength(1);
    expect(metrics.enrichErrors[0]).toContain("temporarily unavailable");
    expect(clearReadingDirtyLedgerBefore).not.toHaveBeenCalled();
  });

  it("increments aiCallsCompleted once after a successful transient retry", async () => {
    let callCount = 0;
    const ids = pursuitIds(3);
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _metrics, options) => {
      callCount += 1;
      if (callCount === 1) throw transient503();
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const resultPromise = runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(),
    );
    await vi.advanceTimersByTimeAsync(1_500);
    await resultPromise;

    expect(callCount).toBe(2);
    expect(metrics.aiCallsCompleted).toBe(1);
    expect(metrics.aiCallsPlanned).toBe(1);
  });
});
