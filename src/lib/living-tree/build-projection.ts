import { buildFoundations } from "@/lib/living-tree/foundations";
import { rankGroups } from "@/lib/living-tree/rank-groups";
import {
  LIVING_TREE_PROJECTION_VERSION,
  MAX_VISIBLE_SLOTS,
  type LatestConfirmedChange,
  type LivingTreeChapterInput,
  type LivingTreeChapterRow,
  type LivingTreeGroupInput,
  type LivingTreeGroupView,
  type LivingTreeProjection,
  type LivingTreeProjectionInput,
} from "@/lib/living-tree/types";

function chapterRow(chapter: LivingTreeChapterInput): LivingTreeChapterRow {
  return {
    goalId: chapter.goalId,
    title: chapter.title,
    status: chapter.status,
    citedObservationCount: chapter.citedObservationCount,
  };
}

function newestChange(chapters: LivingTreeChapterInput[]): LatestConfirmedChange | null {
  let newest: LatestConfirmedChange | null = null;
  for (const chapter of chapters) {
    const candidate = chapter.latestConfirmed;
    if (!candidate) continue;
    if (!newest || candidate.confirmedAt.getTime() > newest.confirmedAt.getTime()) {
      newest = candidate;
    }
  }
  return newest;
}

function groupView(
  group: LivingTreeGroupInput,
  chapters: LivingTreeChapterInput[],
): LivingTreeGroupView {
  return {
    id: group.id,
    name: group.name,
    slot: group.slot,
    version: group.version,
    chapters: chapters.map(chapterRow),
    citedObservationCount: chapters.reduce((sum, c) => sum + c.citedObservationCount, 0),
    latestConfirmedChange: newestChange(chapters),
  };
}

/**
 * Build the Living Tree projection.
 *
 * Pure and read-only. It never assigns a slot, promotes an overflow group or
 * reorders an occupied slot: a freed slot is reported in `freeSlots` and stays
 * visibly free until an operation deliberately fills it inside a transaction.
 * Two identical inputs always produce identical output.
 */
export function buildLivingTreeProjection(
  input: LivingTreeProjectionInput,
): LivingTreeProjection {
  const liveGroups = input.groups.filter((group) => group.archivedAt === null);
  const liveGroupIds = new Set(liveGroups.map((group) => group.id));

  const chapterById = new Map(input.chapters.map((chapter) => [chapter.goalId, chapter]));
  const chaptersByGroup = new Map<string, LivingTreeChapterInput[]>();
  const groupedChapterIds = new Set<string>();

  for (const membership of input.memberships) {
    const chapter = chapterById.get(membership.goalId);
    // A membership pointing at an archived group leaves its chapter findable in
    // All chapters rather than disappearing from the model.
    if (!chapter || !liveGroupIds.has(membership.groupId)) continue;
    const bucket = chaptersByGroup.get(membership.groupId);
    if (bucket) bucket.push(chapter);
    else chaptersByGroup.set(membership.groupId, [chapter]);
    groupedChapterIds.add(chapter.goalId);
  }

  const slotted = liveGroups
    .filter((group) => group.slot !== null)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const unslotted = rankGroups(
    liveGroups.filter((group) => group.slot === null),
    chaptersByGroup,
  );

  const visibleGroups = slotted.map((group) =>
    groupView(group, chaptersByGroup.get(group.id) ?? []),
  );
  const overflowGroups = unslotted.map((group) =>
    groupView(group, chaptersByGroup.get(group.id) ?? []),
  );

  const occupied = new Set(slotted.map((group) => group.slot));
  const freeSlots: number[] = [];
  for (let slot = 1; slot <= MAX_VISIBLE_SLOTS; slot += 1) {
    if (!occupied.has(slot)) freeSlots.push(slot);
  }

  const ungroupedChapters = input.chapters
    .filter((chapter) => !groupedChapterIds.has(chapter.goalId))
    .map(chapterRow);

  const countChapters = (views: LivingTreeGroupView[]) =>
    views.reduce((sum, view) => sum + view.chapters.length, 0);

  return {
    projectionVersion: LIVING_TREE_PROJECTION_VERSION,
    visibleGroups,
    overflowGroups,
    ungroupedChapters,
    freeSlots,
    foundations: buildFoundations(input.backgroundObservations),
    totals: {
      visibleGroups: visibleGroups.length,
      visibleChapters: countChapters(visibleGroups),
      overflowGroups: overflowGroups.length,
      overflowChapters: countChapters(overflowGroups),
      ungroupedChapters: ungroupedChapters.length,
    },
  };
}
