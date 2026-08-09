import type { LifeBackgroundCategory, LifeSubjectType, PursuitStatus } from "@prisma/client";

/** Response/schema version. Bumped when the shape below changes. */
export const LIVING_TREE_PROJECTION_VERSION = "living-tree-v1" as const;

/** Maximum groups the tree shows at once. Everything else lives in All chapters. */
export const MAX_VISIBLE_SLOTS = 5;

/**
 * Input to the projection builder.
 *
 * Deliberately excludes categoryId, sequencePosition, themeId and chapter
 * relationships. Grouping by theme, category or visual proximity is forbidden
 * (Decision 96, Figma 116:2), so the builder is given no way to express it.
 */
export type LivingTreeProjectionInput = {
  groups: LivingTreeGroupInput[];
  /** Unarchived chapters only. */
  chapters: LivingTreeChapterInput[];
  memberships: LivingTreeMembershipInput[];
  /** Already filtered to active, confirmed, non-superseded background. */
  backgroundObservations: FoundationObservationInput[];
};

export type LivingTreeGroupInput = {
  id: string;
  name: string;
  slot: number | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
};

export type LivingTreeChapterInput = {
  goalId: string;
  title: string;
  status: PursuitStatus;
  createdAt: Date;
  citedObservationCount: number;
  /** `lastConfirmedAt ?? confirmedAt` of the newest confirmed observation. */
  latestConfirmed: LatestConfirmedChange | null;
};

export type LivingTreeMembershipInput = { goalId: string; groupId: string };

export type FoundationObservationInput = {
  id: string;
  backgroundCategory: LifeBackgroundCategory | null;
  subjectType: LifeSubjectType;
  subjectLabel: string | null;
  canonicalKey: string | null;
};

export type LatestConfirmedChange = {
  observationId: string;
  text: string;
  confirmedAt: Date;
};

export type LivingTreeChapterRow = {
  goalId: string;
  title: string;
  status: PursuitStatus;
  citedObservationCount: number;
};

export type LivingTreeGroupView = {
  id: string;
  name: string;
  slot: number | null;
  version: number;
  chapters: LivingTreeChapterRow[];
  citedObservationCount: number;
  /** Cited, never narrative prose. */
  latestConfirmedChange: LatestConfirmedChange | null;
};

export type FoundationsSummary = {
  identity: number;
  people: number;
  places: number;
  durableFacts: number;
};

export type LivingTreeProjection = {
  projectionVersion: typeof LIVING_TREE_PROJECTION_VERSION;
  visibleGroups: LivingTreeGroupView[];
  overflowGroups: LivingTreeGroupView[];
  /** Chapters with no group, or whose group is archived. Never lost. */
  ungroupedChapters: LivingTreeChapterRow[];
  /** Reported, never auto-filled on read. */
  freeSlots: number[];
  foundations: FoundationsSummary;
  totals: {
    visibleGroups: number;
    visibleChapters: number;
    overflowGroups: number;
    overflowChapters: number;
    ungroupedChapters: number;
  };
};
