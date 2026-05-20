import type { SequenceAnchor } from "@/lib/branch-sequence";
import type { AreaData, TreeGoalNode } from "./tree-types";

export const EDIT_DRAG_THRESHOLD_PX = 5;

export type EditDragGoalPayload = {
  goalId: string;
  areaId: string;
  branchId: string;
  parentGoalId: string | null;
  areaColor: string;
  title: string;
};

/** What happens when dropping on a pursuit ring. */
export type PursuitDropIntent =
  | { type: "insertBefore"; anchor: Extract<SequenceAnchor, { kind: "before" }> }
  | { type: "insertAfter"; anchor: Extract<SequenceAnchor, { kind: "after" }> }
  | { type: "appendSequence"; anchor: Extract<SequenceAnchor, { kind: "append" }> }
  | { type: "nestUnder"; parentGoalId: string }
  | { type: "appendContinuationChain"; parentGoalId: string };

export type EditDropTarget =
  | {
      kind: "hub";
      branchId: string;
      areaId: string;
      x: number;
      y: number;
      radius: number;
    }
  | {
      kind: "pursuit";
      goalId: string;
      branchId: string;
      areaId: string;
      x: number;
      y: number;
      radius: number;
      intent: PursuitDropIntent;
    };

/** Stable key for comparing hover/drop targets across pointer moves. */
export function editDropTargetKey(target: EditDropTarget | null): string {
  if (!target) return "";
  switch (target.kind) {
    case "hub":
      return `hub:${target.areaId}:${target.branchId}`;
    case "pursuit":
      return `pursuit:${target.goalId}:${target.intent.type}:${JSON.stringify(target.intent)}`;
    default:
      return "";
  }
}

export function flattenAllGoals(areas: AreaData[]): Map<string, TreeGoalNode> {
  const map = new Map<string, TreeGoalNode>();
  const walk = (g: TreeGoalNode) => {
    map.set(g.id, g);
    g.childGoals.forEach(walk);
  };
  for (const area of areas) {
    for (const thread of area.branches) {
      thread.goals.forEach(walk);
    }
  }
  return map;
}

export function isContinuationChild(dragged: EditDragGoalPayload): boolean {
  return dragged.parentGoalId !== null;
}

/** Continuation children may only interact with targets on their current hub (`branchId`). */
export function isEditDropTargetAllowedForDrag(
  dragged: EditDragGoalPayload,
  target: EditDropTarget,
): boolean {
  if (!isContinuationChild(dragged)) return true;
  return target.branchId === dragged.branchId;
}

/** True when `candidateId` is `ancestorId` or nested under it via `parentGoalId`. */
export function isDescendantOf(
  goalsById: Map<string, TreeGoalNode>,
  ancestorId: string,
  candidateId: string,
): boolean {
  if (candidateId === ancestorId) return true;
  let cur: TreeGoalNode | undefined = goalsById.get(candidateId);
  const seen = new Set<string>();
  while (cur?.parentGoalId) {
    if (cur.parentGoalId === ancestorId) return true;
    if (seen.has(cur.parentGoalId)) break;
    seen.add(cur.parentGoalId);
    cur = goalsById.get(cur.parentGoalId);
  }
  return false;
}

const HIT_MAGNET_MUL = 1.35;
/** Effective distance reduction for hub targets while dragging a continuation child. */
export const CONTINUATION_HUB_HIT_BIAS_PX = 24;

const PURSUIT_RING_OUTER_RADIUS = 38;
const PURSUIT_RING_INNER_RADIUS = 26;

export function pursuitRingRadius(intent: PursuitDropIntent): number {
  if (intent.type === "nestUnder") return PURSUIT_RING_INNER_RADIUS;
  return PURSUIT_RING_OUTER_RADIUS;
}

function hitRadius(t: EditDropTarget): number {
  return t.radius * HIT_MAGNET_MUL;
}

function effectiveHitDistance(
  t: EditDropTarget,
  x: number,
  y: number,
  dragged?: EditDragGoalPayload,
): number {
  const raw = Math.hypot(x - t.x, y - t.y);
  if (dragged?.parentGoalId != null && t.kind === "hub") {
    return Math.max(0, raw - CONTINUATION_HUB_HIT_BIAS_PX);
  }
  return raw;
}

/** Lower wins first; on equal distance prefer inner nest ring over outer sequence ring. */
function targetPriority(t: EditDropTarget): number {
  if (t.kind === "hub") return 0;
  if (t.kind === "pursuit") {
    switch (t.intent.type) {
      case "insertBefore":
      case "insertAfter":
      case "appendSequence":
      case "appendContinuationChain":
        return 1;
      case "nestUnder":
        return 2;
      default:
        return 1;
    }
  }
  return 3;
}

export function hitTestDropTarget(
  targets: EditDropTarget[],
  x: number,
  y: number,
  draggedGoalId: string,
  goalsById: Map<string, TreeGoalNode>,
  dragged?: EditDragGoalPayload,
): EditDropTarget | null {
  let best: { target: EditDropTarget; dist: number; priority: number } | null = null;
  for (const t of targets) {
    if (dragged && !isEditDropTargetAllowedForDrag(dragged, t)) continue;
    if (t.kind === "pursuit") {
      if (t.goalId === draggedGoalId) continue;
      const nestId =
        t.intent.type === "nestUnder" || t.intent.type === "appendContinuationChain"
          ? t.intent.parentGoalId
          : null;
      if (nestId && isDescendantOf(goalsById, draggedGoalId, nestId)) continue;
      if (
        t.intent.type !== "nestUnder" &&
        t.intent.type !== "appendContinuationChain" &&
        isDescendantOf(goalsById, draggedGoalId, t.goalId)
      ) {
        continue;
      }
    }
    const rawDist = Math.hypot(x - t.x, y - t.y);
    if (rawDist > hitRadius(t)) continue;
    const dist = effectiveHitDistance(t, x, y, dragged);
    const priority = targetPriority(t);
    if (
      !best ||
      dist < best.dist - 1e-6 ||
      (Math.abs(dist - best.dist) <= 1e-6 && priority > best.priority)
    ) {
      best = { target: t, dist, priority };
    }
  }
  return best?.target ?? null;
}

export function dropTargetStyle(target: EditDropTarget): {
  stroke: string;
  fill: string;
  dash: string;
} {
  switch (target.kind) {
    case "hub":
      return {
        stroke: "rgba(129, 140, 248, 0.95)",
        fill: "rgba(129, 140, 248, 0.14)",
        dash: "8 5",
      };
    case "pursuit":
      switch (target.intent.type) {
        case "nestUnder":
        case "appendContinuationChain":
          return {
            stroke: "rgba(52, 211, 153, 0.95)",
            fill: "rgba(52, 211, 153, 0.12)",
            dash: "5 4",
          };
        default:
          return {
            stroke: "rgba(129, 140, 248, 0.92)",
            fill: "rgba(129, 140, 248, 0.1)",
            dash: "6 4",
          };
      }
    default:
      return { stroke: "rgba(255,255,255,0.8)", fill: "rgba(255,255,255,0.08)", dash: "4 3" };
  }
}

export function dropTargetLabel(target: EditDropTarget): string {
  switch (target.kind) {
    case "hub":
      return "Move to hub";
    case "pursuit":
      switch (target.intent.type) {
        case "insertBefore":
          return "Place before pursuit";
        case "insertAfter":
          return "Place after pursuit";
        case "appendSequence":
          return "Place last on hub";
        case "nestUnder":
          return "Nest under pursuit";
        case "appendContinuationChain":
          return "Append to continuation chain";
        default:
          return "Drop";
      }
    default:
      return "Drop";
  }
}

/** Map a pursuit drop intent to the sequence anchor used by reorganize preview/API. */
export function sequenceAnchorFromPursuitIntent(intent: PursuitDropIntent): SequenceAnchor | null {
  switch (intent.type) {
    case "insertBefore":
      return intent.anchor;
    case "insertAfter":
      return intent.anchor;
    case "appendSequence":
      return intent.anchor;
    default:
      return null;
  }
}

export function isPursuitNestIntent(
  intent: PursuitDropIntent,
): intent is Extract<PursuitDropIntent, { parentGoalId: string }> {
  return intent.type === "nestUnder" || intent.type === "appendContinuationChain";
}
