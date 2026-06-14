export type MapAiSyncMetrics = {
  aiCallsPlanned: number;
  aiCallsCompleted: number;
  digestRunsProcessed: number;
  digestRunsFailed: number;
  digestRunsRemaining: number;
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
  memoryUpdatesDeferred: number;
  memoryUpdatesFlushed: number;
  liteFirstReading: boolean;
  storyFullRegen: boolean;
  readingPacketChars: number;
  /** Reflect response JSON char count after successful parse. */
  reflectResponseChars: number;
  /** Pursuit enrich failures surfaced to mobile (non-fatal). */
  enrichErrors: string[];
  /** Unified reflect call replaced reading delta + enrich drain. */
  reflectCall: boolean;
};

export function emptyMapAiSyncMetrics(): MapAiSyncMetrics {
  return {
    aiCallsPlanned: 0,
    aiCallsCompleted: 0,
    digestRunsProcessed: 0,
    digestRunsFailed: 0,
    digestRunsRemaining: 0,
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
    memoryUpdatesDeferred: 0,
    memoryUpdatesFlushed: 0,
    liteFirstReading: false,
    storyFullRegen: false,
    readingPacketChars: 0,
    reflectResponseChars: 0,
    enrichErrors: [],
    reflectCall: false,
  };
}
