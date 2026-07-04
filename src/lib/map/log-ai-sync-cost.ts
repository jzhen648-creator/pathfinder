import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

/** Rough char→token conversion for ops logging (not billing-grade). */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/** Gemini 2.5 Flash list pricing (USD per 1M tokens) — update when model/pricing changes. */
export const GEMINI_25_FLASH_INPUT_USD_PER_M = 0.15;
export const GEMINI_25_FLASH_OUTPUT_USD_PER_M = 0.6;

export type AiSyncCostEstimate = {
  aiCallsCompleted: number;
  skipped: boolean;
  inputChars: number;
  outputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedUsd: number;
  breakdown: {
    systemPromptChars: number;
    mapContextChars: number;
    userPromptChars: number;
    readingPacketChars: number;
    reflectResponseChars: number;
    reflectFullCalls: number;
    reflectScopedCalls: number;
  };
};

export function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

export function estimateReflectSyncCost(
  metrics: MapAiSyncMetrics,
  options?: { skipped?: boolean },
): AiSyncCostEstimate {
  const skipped = options?.skipped === true || metrics.aiCallsCompleted === 0;

  if (skipped) {
    return {
      aiCallsCompleted: metrics.aiCallsCompleted,
      skipped: true,
      inputChars: 0,
      outputChars: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedUsd: 0,
      breakdown: {
        systemPromptChars: metrics.systemPromptChars,
        mapContextChars: metrics.mapContextChars,
        userPromptChars: metrics.userPromptChars,
        readingPacketChars: metrics.readingPacketChars,
        reflectResponseChars: metrics.reflectResponseChars,
        reflectFullCalls: metrics.reflectFullCalls,
        reflectScopedCalls: metrics.reflectScopedCalls,
      },
    };
  }

  const inputChars =
    metrics.systemPromptChars + metrics.userPromptChars + metrics.readingPacketChars;
  const outputChars = metrics.reflectResponseChars;

  const estimatedInputTokens = estimateTokensFromChars(inputChars);
  const estimatedOutputTokens = estimateTokensFromChars(outputChars);
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

  const estimatedUsd =
    (estimatedInputTokens / 1_000_000) * GEMINI_25_FLASH_INPUT_USD_PER_M +
    (estimatedOutputTokens / 1_000_000) * GEMINI_25_FLASH_OUTPUT_USD_PER_M;

  return {
    aiCallsCompleted: metrics.aiCallsCompleted,
    skipped,
    inputChars,
    outputChars,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedUsd,
    breakdown: {
      systemPromptChars: metrics.systemPromptChars,
      mapContextChars: metrics.mapContextChars,
      userPromptChars: metrics.userPromptChars,
      readingPacketChars: metrics.readingPacketChars,
      reflectResponseChars: metrics.reflectResponseChars,
      reflectFullCalls: metrics.reflectFullCalls,
      reflectScopedCalls: metrics.reflectScopedCalls,
    },
  };
}

export type LogAiSyncCostOptions = {
  skipped: boolean;
  force?: boolean;
  periodicFull?: boolean;
  deliveryBlocked?: boolean;
  rateLimited?: boolean;
};

/** Structured cost log for ops — one line per ai-sync HTTP request. */
export function logAiSyncCost(
  userId: string,
  metrics: MapAiSyncMetrics,
  options: LogAiSyncCostOptions,
): AiSyncCostEstimate {
  const cost = estimateReflectSyncCost(metrics, { skipped: options.skipped });

  console.info("[map/ai-sync] cost", {
    userId,
    force: options.force === true,
    periodicFull: options.periodicFull === true || metrics.periodicFull === true,
    skipped: cost.skipped,
    deliveryBlocked: options.deliveryBlocked === true,
    rateLimited: options.rateLimited === true,
    aiCallsCompleted: cost.aiCallsCompleted,
    dirtyPursuits: metrics.dirtyPursuits,
    dirtyItems: metrics.dirtyItems,
    morePending: metrics.morePending,
    estimatedInputTokens: cost.estimatedInputTokens,
    estimatedOutputTokens: cost.estimatedOutputTokens,
    estimatedTotalTokens: cost.estimatedTotalTokens,
    estimatedUsd: Number(cost.estimatedUsd.toFixed(6)),
    breakdown: cost.breakdown,
  });

  return cost;
}
