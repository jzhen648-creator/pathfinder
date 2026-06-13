import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";

/** Max successful Gemini calls per single ai-sync HTTP request (digest + reading). */
export const MAX_GEMINI_CALLS_PER_SYNC = 2;

export function canMakeSyncGeminiCall(metrics: MapAiSyncMetrics): boolean {
  return metrics.aiCallsCompleted < MAX_GEMINI_CALLS_PER_SYNC;
}

export function remainingSyncGeminiBudget(metrics: MapAiSyncMetrics): number {
  return Math.max(0, MAX_GEMINI_CALLS_PER_SYNC - metrics.aiCallsCompleted);
}
