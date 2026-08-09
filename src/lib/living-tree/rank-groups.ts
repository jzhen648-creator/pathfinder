import type { PursuitStatus } from "@prisma/client";
import type { LivingTreeChapterInput, LivingTreeGroupInput } from "@/lib/living-tree/types";

/**
 * Chapter state priority. A group takes the highest priority among its
 * unarchived members, so a group holding one active chapter outranks a group of
 * completed ones.
 */
const STATUS_PRIORITY: Record<PursuitStatus, number> = {
  ACTIVE: 0,
  MAINTAINING: 1,
  PAUSED: 2,
  COMPLETE: 3,
};
const NO_CHAPTERS = 4;

export function groupStatusPriority(chapters: LivingTreeChapterInput[]): number {
  return chapters.reduce((best, chapter) => Math.min(best, STATUS_PRIORITY[chapter.status]), NO_CHAPTERS);
}

export function latestConfirmedAt(chapters: LivingTreeChapterInput[]): number | null {
  let newest: number | null = null;
  for (const chapter of chapters) {
    const at = chapter.latestConfirmed?.confirmedAt.getTime();
    if (at !== undefined && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/**
 * Deterministic ordering shared by legacy bootstrap and slot promotion.
 *
 * 1. highest-priority chapter state among unarchived members
 * 2. most recent confirmed meaning, groups with none last
 * 3. newest group first, as a recency proxy when nothing is confirmed
 * 4. id, so the result never depends on input order
 *
 * `Goal.updatedAt` is deliberately not used: a cosmetic edit must not reorder
 * the tree.
 */
export function rankGroups(
  groups: LivingTreeGroupInput[],
  chaptersByGroup: Map<string, LivingTreeChapterInput[]>,
): LivingTreeGroupInput[] {
  return [...groups].sort((a, b) => {
    const aChapters = chaptersByGroup.get(a.id) ?? [];
    const bChapters = chaptersByGroup.get(b.id) ?? [];

    const statusDelta = groupStatusPriority(aChapters) - groupStatusPriority(bChapters);
    if (statusDelta !== 0) return statusDelta;

    const aConfirmed = latestConfirmedAt(aChapters);
    const bConfirmed = latestConfirmedAt(bChapters);
    if (aConfirmed !== bConfirmed) {
      if (aConfirmed === null) return 1;
      if (bConfirmed === null) return -1;
      return bConfirmed - aConfirmed;
    }

    const createdDelta = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
