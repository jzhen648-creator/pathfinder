import { describe, expect, it } from "vitest";

import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  canMakeSyncGeminiCall,
  MAX_GEMINI_CALLS_PER_SYNC,
  remainingSyncGeminiBudget,
} from "@/lib/map/sync-gemini-budget";

describe("sync-gemini-budget", () => {
  it("caps at MAX_GEMINI_CALLS_PER_SYNC", () => {
    expect(MAX_GEMINI_CALLS_PER_SYNC).toBe(2);
  });

  it("allows calls until budget exhausted", () => {
    const metrics = emptyMapAiSyncMetrics();
    expect(canMakeSyncGeminiCall(metrics)).toBe(true);
    expect(remainingSyncGeminiBudget(metrics)).toBe(2);

    metrics.aiCallsCompleted = 1;
    expect(canMakeSyncGeminiCall(metrics)).toBe(true);
    expect(remainingSyncGeminiBudget(metrics)).toBe(1);

    metrics.aiCallsCompleted = 2;
    expect(canMakeSyncGeminiCall(metrics)).toBe(false);
    expect(remainingSyncGeminiBudget(metrics)).toBe(0);
  });

  it("never returns negative remaining budget", () => {
    const metrics = emptyMapAiSyncMetrics();
    metrics.aiCallsCompleted = 5;
    expect(remainingSyncGeminiBudget(metrics)).toBe(0);
  });
});
