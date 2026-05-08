import type { RefObject } from "react";
import type { AreaData, MomentNode, Point, TreeGoalNode } from "./tree-types";

export type PanelState =
  | { type: "none" }
  | { type: "foundations" }
  | { type: "area"; area: AreaData }
  | { type: "moment"; moment: MomentNode; area: AreaData }
  | { type: "goal"; goal: TreeGoalNode; area: AreaData };

export type MarksResponse = { marks?: unknown[] };
export type BranchesResponse = unknown[] | { branches?: unknown[]; goals?: unknown[] };

export type TreeSVGProps = {
  areas: AreaData[];
  allAreasForForkGeometry?: AreaData[];
  focused: string | null;
  panel: PanelState;
  onClear: () => void;
  onAreaClick: (area: AreaData) => void;
  onAddGoalPlaceholderClick: (threadId: string) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
  onGoalClick: (goal: TreeGoalNode, area: AreaData) => void;
  onFoundationsClick: () => void;
  exportRootRef?: RefObject<HTMLDivElement | null>;
  showElementGuide?: boolean;
};

export type TreePanelProps = {
  panel: PanelState;
  areas: AreaData[];
  onClose: () => void;
  onCreateBranchFromMoment: (input: {
    limbId: string;
    parentBranchId: string;
    turningPointId: string;
    label: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onAddGoal: () => void;
  onDeleteGoal: (goalId: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleSubtask: (subtaskId: string) => Promise<{ ok: boolean; error?: string }>;
};

export type ViewMode = "tree" | "timeline" | "branch";

export type LayoutPointerDrag =
  | {
      kind: "threadFork";
      areaId: string;
      threadIdx: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
    }
  | {
      kind: "threadRotate";
      areaId: string;
      threadIdx: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      pivot: Point;
      startAngle: number;
      baseRotateDeg: number;
    }
  | {
      kind: "threadBend";
      areaId: string;
      threadIdx: number;
      bendIndex: number;
      pointerId: number;
      startClientX: number;
      startClientY: number;
    }
  | { kind: "limbTip"; areaId: string; pointerId: number; startClientX: number; startClientY: number }
  | { kind: "limbC2"; areaId: string; pointerId: number; startClientX: number; startClientY: number }
  | {
      kind: "moment";
      areaId: string;
      momentId: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
    };

export type MockUserOption = {
  id: string;
  name: string;
  email: string;
};

export type TimelineViewProps = {
  areas: AreaData[];
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
};

export type BranchViewProps = {
  areas: AreaData[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
};
