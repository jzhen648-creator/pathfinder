/**
 * Bump in the same commit/PR as material reflect/enrich prompt or post-gen gate changes.
 * Stored as a suffix on InsightCache.mapVersion — no schema migration.
 */
export const REFLECT_PROMPT_VERSION = "2026-07-20-honest-register";

const MAP_VERSION_SEPARATOR = ":";

export function composeInsightCacheMapVersion(mapHash: string): string {
  return `${mapHash}${MAP_VERSION_SEPARATOR}${REFLECT_PROMPT_VERSION}`;
}

export function parseStoredInsightCacheMapVersion(stored: string): {
  mapHash: string;
  promptVersion: string | null;
} {
  const trimmed = stored.trim();
  const separatorIndex = trimmed.lastIndexOf(MAP_VERSION_SEPARATOR);
  if (separatorIndex <= 0) {
    return { mapHash: trimmed, promptVersion: null };
  }
  return {
    mapHash: trimmed.slice(0, separatorIndex),
    promptVersion: trimmed.slice(separatorIndex + 1) || null,
  };
}

export function isPromptVersionStale(storedMapVersion: string): boolean {
  const { promptVersion } = parseStoredInsightCacheMapVersion(storedMapVersion);
  return promptVersion !== REFLECT_PROMPT_VERSION;
}
