export type Point = { x: number; y: number };

/**
 * Timeline “moment” on a hub (shapes on the tree). Historically called **moments** in product copy;
 * they are backed by **marks** in the API/DB, not by roadmap {@link TreeGoalNode} rows. People often say
 * “goals” for these nodes — in code, **moment** / `MomentNode` = timeline markers; **goal** = roadmap tree goals.
 */
export type MomentNode = {
  id: string;
  branchId: string;
  label: string;
  description: string | null;
  year: number | null;
  significance: number;
  bloomStatus: "ACTIVE" | "COMPLETE" | "ON_HOLD";
  isTurningPoint: boolean;
  future: boolean;
  value: number | null;
  type: string;
  /** ISO calendar date `YYYY-MM-DD` from mark when available (for display / edit). */
  calendarDateIso?: string | null;
  /** Tree-only filler (not loaded from API); branch-from-node is disabled for synthetic rows. */
  synthetic?: boolean;
  /** Stream ambiguous item awaiting Done / In progress / Not started on the tree. */
  needsResolution?: boolean;
};

export type GoalBloomStatus = "ACTIVE" | "MAINTAINING" | "COMPLETE" | "ON_HOLD";

export type TreeMilestoneNode = {
  id: string;
  title: string;
  position: number;
  /** Explicit symbolic completion (ISO string from API); drives orbitals when set. */
  completedAt?: string | null;
  subtasks: { id: string; title: string; position: number; isCompleted: boolean }[];
};

/**
 * Hex/dot projection of canonical relational milestones.
 * Same milestone journey as the roadmap — compact tree view only.
 */
export type TreeOrbitalMilestone = {
  id: string;
  title: string;
  /** Canonical order index from relational milestones (major vs minor dot sizing). */
  position: number;
  completed: boolean;
  /** When set, used for short month labels on the orbital ring (e.g. "Dec"). */
  completedAt?: string | null;
};

export type TreeGoalNode = {
  id: string;
  branchId: string;
  title: string;
  /** AI tree-canvas label only; panel/roadmap use {@link title}. */
  shortLabel?: string | null;
  /** Optional notes from DB (`Goal.description`). */
  description?: string | null;
  /** Calendar year on the goal row when set (timeline / list views). */
  year?: number | null;
  /** ISO `YYYY-MM-DD` — row creation time (swimlane default start). */
  createdAtIso?: string | null;
  /** ISO `YYYY-MM-DD` — explicit swimlane start; when null, use {@link createdAtIso}. */
  timelineStartIso?: string | null;
  /** ISO `YYYY-MM-DD` — target end on the swimlane. */
  deadlineIso?: string | null;
  bloomStatus: GoalBloomStatus;
  positionAngle: number | null;
  /** Predecessor goal when this row is **goal evolution** (longitudinal successor), not a nested subgoal. */
  parentGoalId: string | null;
  /** Ids of successor goals (evolution chain). */
  forkedGoalIds: string[];
  /** Optional 1–5 importance from DB (`Goal.significance`) — feeds render authority (`goal-visual-authority.ts`). */
  significanceTier?: number | null;
  milestones: TreeMilestoneNode[];
  /** Up to six dots sit on hex vertices when `FLAGS.GOAL_MILESTONES` is enabled. */
  orbitalMilestones: TreeOrbitalMilestone[];
  /** Successors linked for tree layout; semantics match goal evolution, not task decomposition. */
  childGoals: TreeGoalNode[];
};

/**
 * One **hub** under a **theme** — maps to a root {@link Branch} row. Holds timeline
 * {@link MomentNode}s on the conduit (when used) and {@link TreeGoalNode}s that orbit the hub in
 * domain-cluster mode. Geometry (fork, conduit, hub screen position) is derived in `tree-forks` /
 * `tree-branch-geometry`, not stored on this row.
 *
 * When `FLAGS.BRANCH_LONGITUDINAL_ALL` is on, callers read {@link sequencedNodes} to lay out goals
 * and moments along a single sequence-position-ordered branch ray. {@link goals} and {@link moments}
 * remain populated for the legacy domain-cluster paths (kept for instant rollback).
 */
export type DomainHubData = {
  id: string;
  /** Display label (hub / catalog title). */
  type: string;
  moments: MomentNode[];
  goals: TreeGoalNode[];
  /**
   * Unified, sequence-ordered list of root nodes on this hub — goals + moments interleaved by
   * `sequencePosition` (no calendar tiebreak applied here; sort is stable). Continuation children
   * (`Goal.parentGoalId != null`) are **excluded** — they keep parent-anchored satellite layout.
   * Drives the refined longitudinal grammar (`tree-branch-geometry.ts` → `branchNodeScreenPosition`).
   */
  sequencedNodes: SequencedBranchNode[];
};

/** One entry in `DomainHubData.sequencedNodes`. */
export type SequencedBranchNode =
  | {
      kind: "goal";
      id: string;
      sequencePosition: number;
      goal: TreeGoalNode;
    }
  | {
      kind: "moment";
      id: string;
      sequencePosition: number;
      moment: MomentNode;
    };

/** @deprecated Renamed to {@link DomainHubData} — hub row, not a spline-owned “branch line”. */
export type AreaBranchData = DomainHubData;

/** Theme (Money, Health, …) with its hubs (`branches` at runtime). */
export type AreaData = {
  id: string;
  label: string;
  color: string;
  summary: string | null;
  branches: DomainHubData[];
};
