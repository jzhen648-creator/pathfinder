import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";

/** Map or memory drift — the only signal exposed as canAutoRefresh (manual-primary UX). */
export function isInsightRowStale(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;
}

export function isStoryRowStale(
  row: { mapVersion: string; memoryVersion: number; payload: string },
  mapVersion: string,
  memoryVersion: number,
  taxonomyVersion: string | null,
): boolean {
  if (isInsightRowStale(row, mapVersion, memoryVersion)) return true;
  if (taxonomyVersion && taxonomyVersion !== TAXONOMY_VERSION) return true;
  if (!isCurrentStoryPayload(row.payload)) return true;
  return false;
}

/** After a successful cache refresh, payloads are current for the client. */
export function insightPayloadStaleAfterSync(refreshed: boolean, rowStale: boolean): boolean {
  return refreshed ? false : rowStale;
}
