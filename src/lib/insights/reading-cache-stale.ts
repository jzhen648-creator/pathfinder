import {
  composeInsightCacheMapVersion,
  isPromptVersionStale,
  parseStoredInsightCacheMapVersion,
} from "@/lib/insights/reflect-prompt-version";

/** Map, memory, or reflect-prompt drift — client signal for "changes waiting". */
export function isReadingDrift(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return (
    composeInsightCacheMapVersion(mapVersion) !== row.mapVersion ||
    row.memoryVersion !== memoryVersion
  );
}

/** True when only the reflect prompt version drifted — map hash and memory still match. */
export function isPromptOnlyReadingDrift(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  if (row.memoryVersion !== memoryVersion) return false;
  const { mapHash } = parseStoredInsightCacheMapVersion(row.mapVersion);
  if (mapHash !== mapVersion) return false;
  return isPromptVersionStale(row.mapVersion);
}
