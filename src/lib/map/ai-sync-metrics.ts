export type MapAiSyncMetrics = {
  aiCallsPlanned: number;
  aiCallsCompleted: number;
  dirtyItems: number;
  dirtyPursuits: number;
  fullRefresh: boolean;
  incrementalRefresh: boolean;
  backfillCalls: number;
  rateLimited: boolean;
  startedWork: boolean;
  morePending: boolean;
  /** Pursuit enrich backlog remaining after this sync tap. */
  pendingInsightCount: number;
  deliveryBlocked: boolean;
  /** Ms until next free-tier delivery when deliveryBlocked. */
  deliveryRetryAfterMs: number;
  readingPacketChars: number;
  /** Reflect system prompt char count (accumulated per Gemini call). */
  systemPromptChars: number;
  /** `<map_context>` JSON char count (accumulated per Gemini call). */
  mapContextChars: number;
  /** Full reflect user message char count (accumulated per Gemini call). */
  userPromptChars: number;
  /** Reflect response JSON char count after successful parse. */
  reflectResponseChars: number;
  /** Full-map reflect calls this sync (whole reading + themes). */
  reflectFullCalls: number;
  /** Scoped reflect calls this sync (dirty pursuits only). */
  reflectScopedCalls: number;
  /** True once any Gemini call reported real token usage (fake provider stays false). */
  hasRealTokenUsage: boolean;
  /** Real prompt (input) tokens billed across reflect calls, from provider usage. */
  realInputTokens: number;
  /** Real completion (output) tokens billed across reflect calls, from provider usage. */
  realOutputTokens: number;
  /** Real input tokens served from provider cache (Gemini implicit/explicit caching). */
  realCachedInputTokens: number;
  /** Pursuit enrich failures surfaced to mobile (non-fatal). */
  enrichErrors: string[];
  /** Unified reflect call replaced reading delta + enrich drain. */
  reflectCall: boolean;
  /** Periodic full-map refresh triggered (empty ledger, interval elapsed). */
  periodicFull: boolean;
};

export function emptyMapAiSyncMetrics(): MapAiSyncMetrics {
  return {
    aiCallsPlanned: 0,
    aiCallsCompleted: 0,
    dirtyItems: 0,
    dirtyPursuits: 0,
    fullRefresh: false,
    incrementalRefresh: false,
    backfillCalls: 0,
    rateLimited: false,
    startedWork: false,
    morePending: false,
    pendingInsightCount: 0,
    deliveryBlocked: false,
    deliveryRetryAfterMs: 0,
    readingPacketChars: 0,
    systemPromptChars: 0,
    mapContextChars: 0,
    userPromptChars: 0,
    reflectResponseChars: 0,
    reflectFullCalls: 0,
    reflectScopedCalls: 0,
    hasRealTokenUsage: false,
    realInputTokens: 0,
    realOutputTokens: 0,
    realCachedInputTokens: 0,
    enrichErrors: [],
    reflectCall: false,
    periodicFull: false,
  };
}
