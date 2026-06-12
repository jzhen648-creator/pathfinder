import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";

/** Map or memory drift — the only client signal for "changes waiting" (manual-primary UX). */
export function isReadingDrift(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;
}

/** @deprecated Use {@link isReadingDrift} */
export const isInsightRowStale = isReadingDrift;

/** Whether ai-sync should regenerate story (includes schema/taxonomy maintenance). */
export function storyNeedsRegeneration(
  row: { mapVersion: string; memoryVersion: number; payload: string },
  mapVersion: string,
  memoryVersion: number,
  taxonomyVersion: string | null,
): boolean {
  if (isReadingDrift(row, mapVersion, memoryVersion)) return true;
  if (taxonomyVersion && taxonomyVersion !== TAXONOMY_VERSION) return true;
  if (!isCurrentStoryPayload(row.payload)) return true;
  return false;
}

/** @deprecated Use {@link storyNeedsRegeneration} for regen; {@link isReadingDrift} for GET stale. */
export const isStoryRowStale = storyNeedsRegeneration;

/** After a successful cache refresh, payloads are current for the client. */
export function insightPayloadStaleAfterSync(refreshed: boolean, rowStale: boolean): boolean {
  return refreshed ? false : rowStale;
}
