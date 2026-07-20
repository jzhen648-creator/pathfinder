import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

/** Max reflect Gemini calls per single ai-sync tap — tunable; cost-model before raising. */
export const MAX_REFLECT_CALLS_PER_SYNC = 4;

export function canMakeReflectCall(metrics: MapAiSyncMetrics): boolean {
  return metrics.aiCallsCompleted < MAX_REFLECT_CALLS_PER_SYNC;
}

export function remainingReflectBudget(metrics: MapAiSyncMetrics): number {
  return Math.max(0, MAX_REFLECT_CALLS_PER_SYNC - metrics.aiCallsCompleted);
}
