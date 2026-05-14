import type { RefObject } from "react";
import type { TreeRenderQuality } from "./tree-render-quality";
import type { AreaData, MomentNode, Point, TreeGoalNode, TreeOrbitalMilestone } from "./tree-types";

export type { TreeOrbitalMilestone };

export type PanelState =
  | { type: "none" }
  | { type: "area"; area: AreaData }
  | { type: "hub"; area: AreaData; thread: AreaData["branches"][number] }
  | { type: "moment"; moment: MomentNode; area: AreaData }
  | { type: "goal"; goal: TreeGoalNode; area: AreaData };

export type MarksResponse = { marks?: unknown[] };
export type BranchesResponse = unknown[] | { branches?: unknown[]; goals?: unknown[] };

/** Hub-scoped goal creation (conversational overlay or modal pre-selection). */
export type AddGoalHubContext = {
  branchId: string;
  areaId: string;
  branchLabel: string;
  areaLabel: string;
  anchorClient: { x: number; y: number };
};

export type TreeSVGProps = {
  areas: AreaData[];
  allAreasForForkGeometry?: AreaData[];
  focused: string | null;
  /** Limb focus mode (tree map): fades non-focused limbs when non-null. */
  focusedLimbId: string | null;
  onToggleLimbFocus: (limbId: string) => void;
  panel: PanelState;
  onClear: () => void;
  onAreaClick: (area: AreaData) => void;
  onHubClick: (area: AreaData, thread: AreaData["branches"][number]) => void;
  onMomentClick: (moment: MomentNode, area: AreaData) => void;
  onGoalClick: (goal: TreeGoalNode, area: AreaData) => void;
  exportRootRef?: RefObject<HTMLDivElement | null>;
  showElementGuide?: boolean;
  /** Dev-only: when set, overrides feature flag default luminous preset for this map. */
  renderQualityDevPreset?: TreeRenderQuality | null;
};

export type TreePanelPresentation = "sheet" | "rail";

export type TreePanelProps = {
  panel: PanelState;
  areas: AreaData[];
  /** Goal detail: `rail` = left overlay column (does not shrink the map); others use bottom `sheet`. */
  panelPresentation?: TreePanelPresentation;
  onClose: () => void;
  onOpenArea: (area: AreaData) => void;
  onOpenHub: (area: AreaData, thread: AreaData["branches"][number]) => void;
  onAddGoal: (hub: AddGoalHubContext) => void;
  onDeleteGoal: (goalId: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateGoal: (goalId: string, body: { title: string }) => Promise<{ ok: boolean; error?: string }>;
  onToggleSubtask: (subtaskId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Append one canonical `Milestone` from tree UX (POST `/api/goals/[id]/milestones`). */
  onAppendCanonicalTreeMilestone: (
    goalId: string,
    title: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Relational milestones: explicit symbolic completion (`PATCH …/milestones/[id]`). */
  onSetMilestoneCompletion: (
    goalId: string,
    milestoneId: string,
    completed: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Open another goal in this panel (same hub or elsewhere on the tree). */
  onNavigateToGoal: (goalId: string) => void;
  /** Goal evolution: propose → revise → commit (POST `/api/goals/[id]/fork/propose` + `/fork`). */
  onProposeEvolveGoal: (
    goalId: string,
    body: {
      whatsDifferent?: string;
      correction?: string;
      previousProposal?: EvolveGoalCommitBody["proposal"];
    },
  ) => Promise<{
    ok: boolean;
    error?: string;
    proposal?: EvolveGoalCommitBody["proposal"];
    usedFallback?: boolean;
  }>;
  onCommitEvolveGoal: (
    goalId: string,
    body: EvolveGoalCommitBody,
  ) => Promise<{ ok: boolean; error?: string; newGoalId?: string }>;
};

export type EvolveGoalCommitBody = {
  title: string;
  description?: string;
  deadline?: string;
  proposal?: {
    title: string;
    description: string;
    targetDate: string | null;
    milestoneTitles: string[];
  };
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
