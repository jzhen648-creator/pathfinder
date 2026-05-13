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
  bloomStatus: "BUD" | "GROWING" | "BLOOMED" | "BRANCHED" | "ENDED";
  isTurningPoint: boolean;
  future: boolean;
  value: number | null;
  type: string;
  /** Tree-only filler (not loaded from API); branch-from-node is disabled for synthetic rows. */
  synthetic?: boolean;
};

export type GoalBloomStatus = "BUD" | "GROWING" | "BLOOMED" | "BRANCHED" | "ENDED";

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
  completed: boolean;
};

export type TreeGoalNode = {
  id: string;
  branchId: string;
  title: string;
  /** Optional notes from DB (`Goal.description`). */
  description?: string | null;
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
 */
export type DomainHubData = {
  id: string;
  /** Display label (hub / catalog title). */
  type: string;
  moments: MomentNode[];
  goals: TreeGoalNode[];
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
