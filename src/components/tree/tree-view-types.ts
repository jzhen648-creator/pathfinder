import type { RefObject } from "react";
import type { SequenceAnchor } from "@/lib/branch-sequence";
import type { MarkInteractionAnchor } from "./mark-hover-card";
import type { AreaData, MomentNode, Point, TreeGoalNode, TreeOrbitalMilestone } from "./tree-types";

export type { MarkInteractionAnchor };

export type { TreeOrbitalMilestone };

export type PanelReturnTo = { type: "hub"; area: AreaData; thread: AreaData["branches"][number] };

export type PanelState =
  | { type: "none" }
  | { type: "area"; area: AreaData }
  | { type: "hub"; area: AreaData; thread: AreaData["branches"][number] }
  | { type: "goal"; goal: TreeGoalNode; area: AreaData; returnTo?: PanelReturnTo };

export type MarksResponse = {
  marks?: unknown[];
  user?: { birthYear?: number | null };
};
export type ArchivedGoalRow = {
  id: string;
  title: string;
  branchId: string | null;
};

export type BranchesResponse =
  | unknown[]
  | { branches?: unknown[]; goals?: unknown[]; archivedGoals?: ArchivedGoalRow[] };

/** Hub-scoped goal creation (conversational overlay or modal pre-selection). */
export type AddGoalHubContext = {
  branchId: string;
  areaId: string;
  branchLabel: string;
  areaLabel: string;
  anchorClient: { x: number; y: number };
  /** When set (e.g. insert between two branch-line goals), POST /api/goals includes this anchor. */
  sequenceAnchor?: SequenceAnchor | null;
};

/** Tree-originated moment create (hub or insert-between); same conversational flag as goals. */
export type AddMomentTreeContext = {
  branchId: string;
  limbId: string;
  branchLabel: string;
  areaLabel: string;
  anchorClient: { x: number; y: number };
  /** Insert on branch line when set; omit or null to append. */
  sequenceAnchor?: SequenceAnchor | null;
};

export type TreeSVGProps = {
  areas: AreaData[];
  /** Ghost preview nodes merged from Stream — rendered in a separate SVG layer. */
  previewAreas?: AreaData[];
  allAreasForForkGeometry?: AreaData[];
  focused: string | null;
  /** Limb focus mode (tree map): fades non-focused limbs when non-null. */
  focusedLimbId: string | null;
  onToggleLimbFocus: (limbId: string) => void;
  panel: PanelState;
  onClear: () => void;
  onAreaClick: (area: AreaData) => void;
  onHubClick: (area: AreaData, thread: AreaData["branches"][number]) => void;
  activeMarkId?: string | null;
  onMarkPointerEnter?: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onMarkPointerLeave?: (momentId: string) => void;
  onMarkClick: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onGoalClick: (goal: TreeGoalNode, area: AreaData) => void;
  exportRootRef?: RefObject<HTMLDivElement | null>;
  showElementGuide?: boolean;
  /** Stream confirmation: pan camera to this hub when `key` changes. */
  streamPanFocus?: { areaId: string; branchId: string; key: number } | null;
  /** Width of the fixed Stream panel (px) — offsets pan centre left. */
  streamPanelWidthPx?: number;
  /** User edit-map mode — drag pursuits to reorganise (disables pan). */
  editMapMode?: boolean;
  /** Draft layout while edit-map session has uncommitted drops. */
  editMapDraftAreas?: AreaData[] | null;
  onEditMapDraftDrop?: (op: import("./tree-edit-map-draft").EditMapDraftOp, nextAreas: AreaData[]) => void;
};

export type TreePanelPresentation = "sheet" | "rail";

export type TreePanelSurface = "roadmap" | "canvas";

export type TreePanelProps = {
  panel: PanelState;
  areas: AreaData[];
  /** Goal detail: `rail` = left overlay column (does not shrink the map); others use bottom `sheet`. */
  panelPresentation?: TreePanelPresentation;
  /** Visual tokens — `canvas` uses dark glass on the tree HUD. */
  panelSurface?: TreePanelSurface;
  onClose: () => void;
  onOpenArea: (area: AreaData) => void;
  onOpenHub: (area: AreaData, thread: AreaData["branches"][number]) => void;
  /** Open theme-level Stream (brain dump across all hubs in this theme). */
  onOpenThemeStream?: (area: AreaData) => void;
  onOpenHubStream?: (area: AreaData, thread: AreaData["branches"][number]) => void;
  onOpenGoalStream?: (area: AreaData, goal: TreeGoalNode) => void;
  editMapMode?: boolean;
  onAddGoal: (hub: AddGoalHubContext) => void;
  /** @deprecated Hub Stream removed — use theme spoke affordance. */
  onOpenStream?: (hub: AddGoalHubContext, opts?: { initialDraft?: string }) => void;
  /**
   * Open “Add moment” from hub or goal panel (`areaId` = theme / limb id, `branchId` = hub row).
   * `sequenceAnchor` from hub = before first sequenced root goal (near hub); from root goal = after that goal; omit/null → append.
   */
  onAddMoment?: (ctx: {
    branchId: string;
    areaId: string;
    sequenceAnchor?: SequenceAnchor | null;
  }) => void;
  onDeleteGoal: (goalId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Soft-removed pursuits and marks (hub archive section). */
  archivedGoals?: ArchivedGoalRow[];
  archivedMarks?: Array<{ id: string; branchId: string; title: string; date?: string | Date | null }>;
  onReviveGoal?: (goalId: string) => Promise<{ ok: boolean; error?: string }>;
  onReviveMark?: (markId: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateGoal: (
    goalId: string,
    body: {
      title?: string;
      timelineStartIso?: string | null;
      deadlineIso?: string | null;
      bloomStatus?: "ACTIVE" | "ON_HOLD" | "COMPLETE";
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  onMoveGoalToHub: (
    goalId: string,
    branchId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
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
  /** After sparse-context enrich (reload tree data). */
  onSparseEnriched?: () => void | Promise<void>;
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
  | {
      kind: "domainHub";
      areaId: string;
      branchId: string;
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

export type TimelineViewProps = {
  areas: AreaData[];
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
  activeMarkId?: string | null;
  onMarkPointerEnter?: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onMarkPointerLeave?: (momentId: string) => void;
  onMarkClick: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onGoalClick: (goal: TreeGoalNode, area: AreaData) => void;
  onDeleteGoal: (goalId: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveMark: (momentId: string) => Promise<{ ok: boolean; error?: string }>;
  onAddMarkContext?: (anchor: MarkInteractionAnchor) => void;
};

/** Timeline tab swimlane: no archive/delete entry points (use mark hover card). */
export type SwimlaneTimelineProps = Omit<TimelineViewProps, "onDeleteGoal" | "onRemoveMark"> & {
  /** Profile birth year — axis starts at Jan 1 of this year when set (same as roadmap). */
  birthYear?: number | null;
  onUpdateGoalTimeline?: (
    goalId: string,
    body: { timelineStartIso: string | null; deadlineIso: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
};

export type BranchViewProps = {
  areas: AreaData[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  activeMarkId?: string | null;
  onMarkPointerEnter?: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onMarkPointerLeave?: (momentId: string) => void;
  onMarkClick: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  focused: string | null;
  onAreaClick: (area: AreaData) => void;
};
