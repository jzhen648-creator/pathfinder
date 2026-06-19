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
  clearReadingDirtyLedger,
  type ReadingDirtyAnalysis,
} from "@/lib/map/reading-dirty-ledger";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import { MAX_REFLECT_CALLS_PER_SYNC } from "@/lib/map/sync-gemini-budget";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";

vi.mock("@/lib/ai/apply-reflect-output", () => ({
  applyReflectOutput: vi.fn(),
}));

vi.mock("@/lib/map/reading-dirty-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/reading-dirty-ledger")>();
  return {
    ...actual,
    clearReadingDirtyForPursuits: vi.fn(),
    clearReadingDirtyLedger: vi.fn(),
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
    hubIds: [],
    markIds: [],
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

function batchOptions(needsReadingRefresh: boolean) {
  return {
    needsReadingRefresh,
    mapContext: emptyMapContext(),
    amountImpactEligible: false,
    holisticBenchmarkEligible: false,
  };
}

function mockReflectForBatch(batch: string[], includeReading: boolean): ReflectResponse {
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
    reading: includeReading ? "Whole-map reading prose." : "",
    pursuits,
    themes: {},
  };
}

describe("runReflectBatchesIncremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyReflectOutput).mockImplementation(async (_userId, reflect) => ({
      insightsWritten: true,
      storyWritten: Boolean(reflect.reading.trim()),
    }));
    vi.mocked(clearReadingDirtyForPursuits).mockResolvedValue(undefined);
    vi.mocked(clearReadingDirtyLedger).mockResolvedValue(undefined);
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _prev, _metrics, options) =>
      mockReflectForBatch(batch, options?.scope === "full"),
    );
  });

  afterEach(() => {
    setGenerateReflectResponseDelegate(null);
  });

  it("stops at MAX_REFLECT_CALLS_PER_SYNC on a large dirty set", async () => {
    const ids = pursuitIds(33);
    let callCount = 0;
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _prev, _metrics, options) => {
      callCount += 1;
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: ["work"], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      "",
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(true),
    );

    expect(callCount).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(result.geminiCallsMade).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.aiCallsCompleted).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.aiCallsPlanned).toBe(MAX_REFLECT_CALLS_PER_SYNC);
    expect(metrics.morePending).toBe(true);
    expect(metrics.pendingInsightCount).toBe(1);
    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 32));
    expect(clearReadingDirtyLedger).not.toHaveBeenCalled();
    expect(result.storyRefreshed).toBe(true);
  });

  it("keeps aiCallsPlanned aligned with completed calls when capped", async () => {
    const ids = pursuitIds(25);
    const metrics = emptyMapAiSyncMetrics();
    await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      "",
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(true),
    );

    expect(metrics.aiCallsPlanned).toBe(metrics.aiCallsCompleted);
    expect(metrics.aiCallsPlanned).toBe(4);
    expect(clearReadingDirtyLedger).toHaveBeenCalledWith(USER_ID);
  });

  it("clears dirty ledger for completed pursuits only on cap-exhaust partial exit", async () => {
    const ids = pursuitIds(33);
    const metrics = emptyMapAiSyncMetrics();
    await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: [], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      "",
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(false),
    );

    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 32));
    expect(metrics.pendingInsightCount).toBe(1);
    expect(clearReadingDirtyLedger).not.toHaveBeenCalled();
  });

  it("uses full scope for batch 0 when needsReadingRefresh", async () => {
    const ids = pursuitIds(3);
    const scopes: Array<string | undefined> = [];
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _prev, _metrics, options) => {
      scopes.push(options?.scope);
      return mockReflectForBatch(batch, options?.scope === "full");
    });

    const metrics = emptyMapAiSyncMetrics();
    const result = await runReflectBatchesIncremental(
      USER_ID,
      emptyDirty(),
      { pursuitIds: ids, themeIds: ["work"], mode: "dirty" },
      DEFAULT_PURSUIT_ENRICH_OPTIONS,
      "",
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(true),
    );

    expect(scopes).toEqual(["full"]);
    expect(result.storyRefreshed).toBe(true);
    expect(clearReadingDirtyLedger).toHaveBeenCalledWith(USER_ID);
  });

  it("clears completed pursuits when a later batch errors", async () => {
    const ids = pursuitIds(10);
    let callIndex = 0;
    setGenerateReflectResponseDelegate(async (_userId, _dirty, batch, _themes, _opts, _prev, _metrics, options) => {
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
      "",
      MAP_VERSION,
      MEMORY_VERSION,
      metrics,
      batchOptions(false),
    );

    expect(result.geminiCallsMade).toBe(1);
    expect(metrics.morePending).toBe(true);
    expect(clearReadingDirtyForPursuits).toHaveBeenCalledWith(USER_ID, ids.slice(0, 8));
    expect(clearReadingDirtyLedger).not.toHaveBeenCalled();
  });
});
