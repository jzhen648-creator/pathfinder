import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

/** Max successful Gemini calls per single ai-sync HTTP request (digest + reading). */
export const MAX_GEMINI_CALLS_PER_SYNC = 2;

/** Max reflect Gemini calls per single ai-sync tap — tunable; cost-model before raising. */
export const MAX_REFLECT_CALLS_PER_SYNC = 4;

export function canMakeSyncGeminiCall(metrics: MapAiSyncMetrics): boolean {
  return metrics.aiCallsCompleted < MAX_GEMINI_CALLS_PER_SYNC;
}

export function remainingSyncGeminiBudget(metrics: MapAiSyncMetrics): number {
  return Math.max(0, MAX_GEMINI_CALLS_PER_SYNC - metrics.aiCallsCompleted);
}

export function canMakeReflectCall(metrics: MapAiSyncMetrics): boolean {
  return metrics.aiCallsCompleted < MAX_REFLECT_CALLS_PER_SYNC;
}

export function remainingReflectBudget(metrics: MapAiSyncMetrics): number {
  return Math.max(0, MAX_REFLECT_CALLS_PER_SYNC - metrics.aiCallsCompleted);
}
