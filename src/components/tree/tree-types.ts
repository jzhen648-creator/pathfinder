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
  /** Tree-only filler moments (not loaded from API); branch-from-moment is disabled. */
  synthetic?: boolean;
};

export type GoalBloomStatus = "BUD" | "GROWING" | "BLOOMED" | "BRANCHED" | "ENDED";

export type TreeMilestoneNode = {
  id: string;
  title: string;
  position: number;
  subtasks: { id: string; isCompleted: boolean }[];
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

export type ThreadData = {
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

export type AreaData = {
  id: string;
  label: string;
  color: string;
  summary: string | null;
  threads: ThreadData[];
};
