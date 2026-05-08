export type Point = { x: number; y: number };

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
  subtasks: { id: string; title: string; position: number; isCompleted: boolean }[];
};

export type TreeGoalNode = {
  id: string;
  branchId: string;
  title: string;
  bloomStatus: GoalBloomStatus;
  positionAngle: number | null;
  parentGoalId: string | null;
  forkedGoalIds: string[];
  milestones: TreeMilestoneNode[];
  childGoals: TreeGoalNode[];
};

/** One main branch line on the tree for a life area (maps to a root {@link Branch} row). */
export type AreaBranchData = {
  id: string;
  type: string;
  fromT: number;
  p1: Point;
  p2: Point;
  strokeWidth: number;
  moments: MomentNode[];
  goals: TreeGoalNode[];
  siblings?: { id: string; label: string }[];
  splitT?: number;
  postSplitP1?: Point;
  postSplitStrokeWidth?: number;
};

/** Life area (Money, Health, …) with its rendered branch lines. */
export type AreaData = {
  id: string;
  label: string;
  color: string;
  summary: string | null;
  branches: AreaBranchData[];
};
