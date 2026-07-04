import { describe, expect, it } from "vitest";

import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  estimateReflectSyncCost,
  estimateTokensFromChars,
} from "@/lib/map/log-ai-sync-cost";

describe("log-ai-sync-cost", () => {
  it("estimates tokens from chars using chars/4 ceiling", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
    expect(estimateTokensFromChars(CHARS_PER_TOKEN_ESTIMATE * 100)).toBe(100);
  });

  it("returns zero cost when sync skipped or no calls completed", () => {
    const metrics = emptyMapAiSyncMetrics();
    const skipped = estimateReflectSyncCost(metrics, { skipped: true });
    expect(skipped.skipped).toBe(true);
    expect(skipped.estimatedTotalTokens).toBe(0);
    expect(skipped.estimatedUsd).toBe(0);

    const noCalls = emptyMapAiSyncMetrics();
    noCalls.systemPromptChars = 4000;
    noCalls.userPromptChars = 8000;
    const idle = estimateReflectSyncCost(noCalls);
    expect(idle.skipped).toBe(true);
    expect(idle.estimatedTotalTokens).toBe(0);
  });

  it("aggregates input chars and estimates USD for completed reflect calls", () => {
    const metrics = emptyMapAiSyncMetrics();
    metrics.aiCallsCompleted = 2;
    metrics.systemPromptChars = 8000;
    metrics.mapContextChars = 24000;
    metrics.userPromptChars = 32000;
    metrics.readingPacketChars = 4000;
    metrics.reflectResponseChars = 12000;
    metrics.reflectFullCalls = 1;
    metrics.reflectScopedCalls = 1;

    const cost = estimateReflectSyncCost(metrics);

    expect(cost.skipped).toBe(false);
    expect(cost.inputChars).toBe(8000 + 32000 + 4000);
    expect(cost.outputChars).toBe(12000);
    expect(cost.estimatedInputTokens).toBe(Math.ceil(cost.inputChars / 4));
    expect(cost.estimatedOutputTokens).toBe(3000);
    expect(cost.estimatedTotalTokens).toBe(
      cost.estimatedInputTokens + cost.estimatedOutputTokens,
    );
    expect(cost.estimatedUsd).toBeGreaterThan(0);
    expect(cost.breakdown.reflectFullCalls).toBe(1);
    expect(cost.breakdown.reflectScopedCalls).toBe(1);
  });
});
