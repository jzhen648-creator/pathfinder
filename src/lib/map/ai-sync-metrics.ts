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
  memoryUpdatesDeferred: number;
  memoryUpdatesFlushed: number;
  liteFirstReading: boolean;
  storyFullRegen: boolean;
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
    memoryUpdatesDeferred: 0,
    memoryUpdatesFlushed: 0,
    liteFirstReading: false,
    storyFullRegen: false,
  };
}
