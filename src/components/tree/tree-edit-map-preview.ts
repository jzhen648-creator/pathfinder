import type { SequenceAnchor } from "@/lib/branch-sequence";

import {

  isPursuitNestIntent,

  sequenceAnchorFromPursuitIntent,

  type EditDragGoalPayload,

  type EditDropTarget,

} from "./tree-edit-drag";

import type { AreaData, DomainHubData, SequencedBranchNode, TreeGoalNode } from "./tree-types";



function findGoalById(goals: TreeGoalNode[], goalId: string): TreeGoalNode | null {

  for (const g of goals) {

    if (g.id === goalId) return g;

    const nested = findGoalById(g.childGoals, goalId);

    if (nested) return nested;

  }

  return null;

}



function extractGoalFromThread(thread: DomainHubData, goalId: string): TreeGoalNode | null {

  const rootIdx = thread.goals.findIndex((g) => g.id === goalId);

  if (rootIdx >= 0) {

    const [goal] = thread.goals.splice(rootIdx, 1);

    return goal ?? null;

  }

  for (const root of thread.goals) {

    const nested = extractFromChildren(root, goalId);

    if (nested) return nested;

  }

  return null;

}



function extractFromChildren(parent: TreeGoalNode, goalId: string): TreeGoalNode | null {

  const idx = parent.childGoals.findIndex((c) => c.id === goalId);

  if (idx >= 0) {

    const [goal] = parent.childGoals.splice(idx, 1);

    return goal ?? null;

  }

  for (const child of parent.childGoals) {

    const nested = extractFromChildren(child, goalId);

    if (nested) return nested;

  }

  return null;

}



function removeGoalFromSequenced(thread: DomainHubData, goalId: string): SequencedBranchNode | null {

  const idx = thread.sequencedNodes.findIndex((n) => n.kind === "goal" && n.goal.id === goalId);

  if (idx < 0) return null;

  const [node] = thread.sequencedNodes.splice(idx, 1);

  return node ?? null;

}



function insertSequencedAt(

  thread: DomainHubData,

  node: SequencedBranchNode,

  anchor: SequenceAnchor,

): void {

  const nodes = thread.sequencedNodes;

  let insertAt = nodes.length;

  if (anchor.kind === "before") {

    const i = nodes.findIndex((n) => n.id === anchor.nodeId);

    insertAt = i >= 0 ? i : nodes.length;

  } else if (anchor.kind === "between") {

    const afterIdx = nodes.findIndex((n) => n.id === anchor.afterNodeId);

    insertAt = afterIdx >= 0 ? afterIdx + 1 : nodes.length;

  } else if (anchor.kind === "after") {

    const i = nodes.findIndex((n) => n.id === anchor.nodeId);

    insertAt = i >= 0 ? i + 1 : nodes.length;

  }

  thread.sequencedNodes = [...nodes.slice(0, insertAt), node, ...nodes.slice(insertAt)];

}



function sequencedGoalNode(goal: TreeGoalNode): SequencedBranchNode {

  return {

    kind: "goal",

    id: goal.id,

    sequencePosition: Number.POSITIVE_INFINITY,

    goal,

  };

}



/** Reorder a sequenced root, or promote a continuation child to root and insert at `anchor`. */

function applySequenceDropOnThread(

  thread: DomainHubData,

  goalId: string,

  anchor: SequenceAnchor,

): boolean {

  const seqNode = removeGoalFromSequenced(thread, goalId);

  if (seqNode) {

    insertSequencedAt(thread, seqNode, anchor);

    return true;

  }

  const goal = extractGoalFromThread(thread, goalId);

  if (!goal) return false;

  goal.parentGoalId = null;

  if (!thread.goals.some((g) => g.id === goal.id)) {

    thread.goals.push(goal);

  }

  insertSequencedAt(thread, sequencedGoalNode(goal), anchor);

  return true;

}



function nestParentGoalIdFromTarget(target: EditDropTarget): string | null {

  if (target.kind !== "pursuit" || !isPursuitNestIntent(target.intent)) return null;

  return target.intent.parentGoalId;

}



/**

 * Client-side layout preview while edit-map dragging — reorders `sequencedNodes` and goal trees

 * without persisting. The dragged pursuit stays on the cursor ghost; siblings reflow around its

 * would-be slot.

 */

export function buildEditMapPreviewAreas(

  areas: AreaData[],

  dragged: EditDragGoalPayload,

  target: EditDropTarget,

): AreaData[] | null {

  const cloned: AreaData[] = structuredClone(areas);



  const nestParentId = nestParentGoalIdFromTarget(target);

  if (nestParentId) {

    const destArea = cloned.find((a) => a.id === target.areaId);

    const destThread = destArea?.branches.find((b) => b.id === target.branchId);

    if (!destArea || !destThread) return null;



    for (const area of cloned) {

      for (const thread of area.branches) {

        if (thread.id !== dragged.branchId) continue;

        removeGoalFromSequenced(thread, dragged.goalId);

        const goal = extractGoalFromThread(thread, dragged.goalId);

        if (!goal) return null;

        const parent = findGoalById(destThread.goals, nestParentId);

        if (!parent) return null;

        goal.parentGoalId = nestParentId;

        goal.branchId = destThread.id;

        parent.childGoals = [...parent.childGoals, goal];

        return cloned;

      }

    }

    return null;

  }



  const anchor: SequenceAnchor =

    target.kind === "hub"

      ? { kind: "append" }

      : target.kind === "pursuit"

        ? sequenceAnchorFromPursuitIntent(target.intent) ?? { kind: "append" }

        : { kind: "append" };

  const destArea = cloned.find((a) => a.id === target.areaId);

  const destThread = destArea?.branches.find((b) => b.id === target.branchId);

  if (!destArea || !destThread) return null;



  let sourceThread: DomainHubData | undefined;

  for (const area of cloned) {

    for (const thread of area.branches) {

      if (thread.id !== dragged.branchId) continue;

      sourceThread = thread;

      break;

    }

    if (sourceThread) break;

  }

  if (!sourceThread) return null;



  if (sourceThread.id === destThread.id) {

    return applySequenceDropOnThread(sourceThread, dragged.goalId, anchor) ? cloned : null;

  }



  const seqNode = removeGoalFromSequenced(sourceThread, dragged.goalId);

  const goal = extractGoalFromThread(sourceThread, dragged.goalId);

  if (!goal) return null;

  goal.parentGoalId = null;

  goal.branchId = destThread.id;

  destThread.goals.push(goal);

  insertSequencedAt(destThread, seqNode ?? sequencedGoalNode(goal), anchor);

  return cloned;

}


