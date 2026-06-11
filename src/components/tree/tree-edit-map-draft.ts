import type { SequenceAnchor } from "@/lib/branch-sequence";

import type { GoalReorganizeBody } from "@/lib/validation/goal-reorganize";

import {

  isEditDropTargetAllowedForDrag,

  isPursuitNestIntent,

  sequenceAnchorFromPursuitIntent,

  type EditDragGoalPayload,

  type EditDropTarget,

} from "./tree-edit-drag";

import type { AreaData, DomainHubData, TreeGoalNode } from "./tree-types";



export type EditMapDraftOp = {

  goalId: string;

  goalTitle: string;

  body: GoalReorganizeBody;

  summaryLine: string;

};



function findGoalInAreas(areas: AreaData[], goalId: string): { goal: TreeGoalNode; area: AreaData } | null {

  const walk = (goals: TreeGoalNode[], area: AreaData): TreeGoalNode | null => {

    for (const g of goals) {

      if (g.id === goalId) return g;

      const nested = walk(g.childGoals, area);

      if (nested) return nested;

    }

    return null;

  };

  for (const area of areas) {

    for (const thread of area.branches) {

      const g = walk(thread.goals, area);

      if (g) return { goal: g, area };

    }

  }

  return null;

}



function findHubLabel(areas: AreaData[], branchId: string): string {

  for (const area of areas) {

    const thread = area.branches.find((b) => b.id === branchId);

    if (thread) {

      const label = thread.type?.trim();

      return label ? `hub “${label}”` : "hub";

    }

  }

  return "hub";

}



function truncateTitle(title: string, max = 36): string {

  const t = title.trim() || "Untitled pursuit";

  return t.length > max ? `${t.slice(0, max - 1)}…` : t;

}



function findThread(areas: AreaData[], branchId: string): DomainHubData | null {

  for (const area of areas) {

    const thread = area.branches.find((b) => b.id === branchId);

    if (thread) return thread;

  }

  return null;

}



function goalSeqIndex(thread: DomainHubData, goalId: string): number {

  return thread.sequencedNodes.findIndex((n) => n.kind === "goal" && n.goal.id === goalId);

}



function isGoalAtSequenceAnchor(thread: DomainHubData, goalId: string, anchor: SequenceAnchor): boolean {

  const seq = thread.sequencedNodes;

  const idx = goalSeqIndex(thread, goalId);

  if (idx < 0) return false;

  if (anchor.kind === "append") {

    for (let i = seq.length - 1; i >= 0; i -= 1) {

      if (seq[i]!.kind === "goal") return idx === i;

    }

    return false;

  }

  if (anchor.kind === "before") {

    const at = seq.findIndex((n) => n.id === anchor.nodeId);

    return at >= 0 && idx === at;

  }

  if (anchor.kind === "between") {

    return idx > 0 && seq[idx - 1]!.id === anchor.afterNodeId && seq[idx]!.id === anchor.beforeNodeId;

  }

  if (anchor.kind === "after") {

    const at = seq.findIndex((n) => n.id === anchor.nodeId);

    return at >= 0 && idx === at + 1;

  }

  return false;

}



/** True when the drop would not change map structure (skip queuing a draft op). */

export function isEditMapDropNoop(

  dragged: EditDragGoalPayload,

  target: EditDropTarget,

  areas: AreaData[],

): boolean {

  if (target.kind === "hub") {

    return dragged.branchId === target.branchId && dragged.parentGoalId === null;

  }

  if (target.kind === "pursuit") {

    if (isPursuitNestIntent(target.intent)) {

      return dragged.parentGoalId === target.intent.parentGoalId;

    }

    const anchor = sequenceAnchorFromPursuitIntent(target.intent);

    if (!anchor) return false;

    if (dragged.branchId !== target.branchId) return false;

    const thread = findThread(areas, target.branchId);

    if (!thread) return false;

    return isGoalAtSequenceAnchor(thread, dragged.goalId, anchor);

  }

  return false;

}



/** Build a queued API op + summary line for one edit-map drop. */

export function dropTargetToDraftOp(

  dragged: EditDragGoalPayload,

  target: EditDropTarget,

  areas: AreaData[],

): EditMapDraftOp | null {

  if (!isEditDropTargetAllowedForDrag(dragged, target)) return null;

  if (isEditMapDropNoop(dragged, target, areas)) return null;



  const goalTitle = truncateTitle(dragged.title);



  if (target.kind === "pursuit" && isPursuitNestIntent(target.intent)) {

    const parent = findGoalInAreas(areas, target.intent.parentGoalId);

    const parentTitle = parent ? truncateTitle(parent.goal.title) : "another pursuit";

    const summaryLine =

      target.intent.type === "appendContinuationChain"

        ? `Append “${goalTitle}” to continuation chain under “${parentTitle}”`

        : `Nest “${goalTitle}” under “${parentTitle}”`;

    return {

      goalId: dragged.goalId,

      goalTitle,

      body: { op: "reparent", parentGoalId: target.intent.parentGoalId },

      summaryLine,

    };

  }



  const hubLabel = findHubLabel(areas, target.branchId);

  if (target.kind === "hub") {

    return {

      goalId: dragged.goalId,

      goalTitle,

      body: { op: "moveToHub", categoryId: target.branchId },

      summaryLine: `Move “${goalTitle}” to ${hubLabel}`,

    };

  }



  if (target.kind === "pursuit") {

    const anchor = sequenceAnchorFromPursuitIntent(target.intent);

    if (!anchor) return null;

    return {

      goalId: dragged.goalId,

      goalTitle,

      body: {

        op: "moveToHub",

        categoryId: target.branchId,

        sequenceAnchor: anchor,

      },

      summaryLine: `Reorder “${goalTitle}” on ${hubLabel}`,

    };

  }



  return null;

}



export async function applyEditMapDraftOps(

  ops: EditMapDraftOp[],

): Promise<{ ok: true } | { ok: false; error: string }> {

  for (const op of ops) {

    const res = await fetch(`/api/goals/${op.goalId}/reorganize`, {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(op.body),

    });

    if (!res.ok) {

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      return { ok: false, error: data.error ?? `Could not apply: ${op.summaryLine}` };

    }

  }

  return { ok: true };

}



export function buildEditMapStreamDraft(ops: EditMapDraftOp[]): string {

  if (ops.length === 0) return "";

  const bullets = ops.map((o) => `• ${o.summaryLine}`).join("\n");

  return `I reorganised my map while editing:\n${bullets}\n\n`;

}


