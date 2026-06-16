import { describe, expect, it } from "vitest";

import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  canMakeReflectCall,
  MAX_REFLECT_CALLS_PER_SYNC,
  remainingReflectBudget,
} from "@/lib/map/sync-gemini-budget";

describe("reflect gemini budget", () => {
  it("allows calls until MAX_REFLECT_CALLS_PER_SYNC", () => {
    const metrics = emptyMapAiSyncMetrics();
    expect(canMakeReflectCall(metrics)).toBe(true);
    expect(remainingReflectBudget(metrics)).toBe(MAX_REFLECT_CALLS_PER_SYNC);

    metrics.aiCallsCompleted = MAX_REFLECT_CALLS_PER_SYNC - 1;
    expect(canMakeReflectCall(metrics)).toBe(true);
    expect(remainingReflectBudget(metrics)).toBe(1);

    metrics.aiCallsCompleted = MAX_REFLECT_CALLS_PER_SYNC;
    expect(canMakeReflectCall(metrics)).toBe(false);
    expect(remainingReflectBudget(metrics)).toBe(0);
  });
});
