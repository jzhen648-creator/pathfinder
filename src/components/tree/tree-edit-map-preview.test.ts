import assert from "node:assert/strict";
import { buildEditMapPreviewAreas } from "./tree-edit-map-preview";
import type { EditDragGoalPayload, EditDropTarget } from "./tree-edit-drag";
import type { AreaData, DomainHubData, TreeGoalNode } from "./tree-types";

function goal(id: string, branchId: string, parentGoalId: string | null): TreeGoalNode {
  return {
    id,
    branchId,
    title: id,
    shortLabel: null,
    description: null,
    year: null,
    createdAtIso: null,
    timelineStartIso: null,
    deadlineIso: null,
    bloomStatus: "ACTIVE",
    positionAngle: null,
    parentGoalId,
    forkedGoalIds: [],
    milestones: [],
    orbitalMilestones: [],
    significanceTier: null,
    childGoals: [],
  };
}

function findGoalInThread(thread: DomainHubData, goalId: string): TreeGoalNode | null {
  for (const root of thread.goals) {
    if (root.id === goalId) return root;
    const nested = root.childGoals.find((c) => c.id === goalId);
    if (nested) return nested;
  }
  return null;
}

const parent = goal("g-parent", "b1", null);
const child = goal("g-child", "b1", "g-parent");
parent.childGoals = [child];

const thread: DomainHubData = {
  id: "b1",
  type: "Career",
  goals: [parent],
  moments: [],
  sequencedNodes: [
    { kind: "goal", id: "g-parent", sequencePosition: 100, goal: parent },
  ],
};

const areas: AreaData[] = [
  {
    id: "work",
    label: "Work",
    color: "#6366f1",
    summary: null,
    branches: [thread],
  },
];

const continuationDragged: EditDragGoalPayload = {
  goalId: "g-child",
  areaId: "work",
  branchId: "b1",
  parentGoalId: "g-parent",
  areaColor: "#6366f1",
  title: "Child",
};

const hubTarget: EditDropTarget = {
  kind: "hub",
  branchId: "b1",
  areaId: "work",
  x: 0,
  y: 0,
  radius: 52,
};

const hubPreview = buildEditMapPreviewAreas(areas, continuationDragged, hubTarget);
assert.ok(hubPreview, "continuation hub drop produces preview");

const hubThread = hubPreview![0]!.branches[0]!;
const promoted = findGoalInThread(hubThread, "g-child");
assert.ok(promoted, "child present on hub after hub drop preview");
assert.equal(promoted!.parentGoalId, null, "hub drop clears parentGoalId");
assert.ok(
  hubThread.sequencedNodes.some((n) => n.kind === "goal" && n.goal.id === "g-child"),
  "promoted child appears in sequencedNodes",
);
const previewParent = findGoalInThread(hubThread, "g-parent");
assert.equal(previewParent?.childGoals.length, 0, "child removed from parent childGoals");

const g1 = goal("g1", "b1", null);
const g2 = goal("g2", "b1", null);
const nested = goal("g-nested", "b1", "g1");
g1.childGoals = [nested];

const reorderThread: DomainHubData = {
  id: "b1",
  type: "Hub",
  goals: [g1, g2],
  moments: [],
  sequencedNodes: [
    { kind: "goal", id: "g1", sequencePosition: 100, goal: g1 },
    { kind: "goal", id: "g2", sequencePosition: 200, goal: g2 },
  ],
};

const reorderAreas: AreaData[] = [
  {
    id: "a1",
    label: "Theme",
    color: "#fff",
    summary: null,
    branches: [reorderThread],
  },
];

const betweenTarget: EditDropTarget = {
  kind: "pursuit",
  goalId: "g2",
  branchId: "b1",
  areaId: "a1",
  x: 0,
  y: 0,
  radius: 38,
  intent: { type: "insertBefore", anchor: { kind: "before", nodeId: "g2" } },
};

const nestedDragged: EditDragGoalPayload = {
  goalId: "g-nested",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: "g1",
  areaColor: "#fff",
  title: "Nested",
};

const betweenPreview = buildEditMapPreviewAreas(reorderAreas, nestedDragged, betweenTarget);
assert.ok(betweenPreview, "continuation between-slot drop produces preview");

const betweenThread = betweenPreview![0]!.branches[0]!;
const betweenPromoted = findGoalInThread(betweenThread, "g-nested");
assert.equal(betweenPromoted?.parentGoalId, null, "between-slot promotes continuation to root");
const seqIds = betweenThread.sequencedNodes
  .filter((n) => n.kind === "goal")
  .map((n) => n.goal.id);
assert.deepEqual(seqIds, ["g1", "g-nested", "g2"], "promoted child inserted between sequenced roots");

const rootDragged: EditDragGoalPayload = {
  goalId: "g1",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: null,
  areaColor: "#fff",
  title: "First",
};

const g1Node = goal("g1", "b1", null);
const g2Node = goal("g2", "b1", null);
const reorderAreasFresh: AreaData[] = [
  {
    id: "a1",
    label: "Theme",
    color: "#fff",
    summary: null,
    branches: [
      {
        id: "b1",
        type: "Hub",
        goals: [g1Node, g2Node],
        moments: [],
        sequencedNodes: [
          { kind: "goal", id: "g2", sequencePosition: 100, goal: g2Node },
          { kind: "goal", id: "g1", sequencePosition: 200, goal: g1Node },
        ],
      },
    ],
  },
];

const reorderPreview = buildEditMapPreviewAreas(reorderAreasFresh, rootDragged, betweenTarget);
assert.ok(reorderPreview, "root reorder insert-before still produces preview");
const reorderSeqIds = reorderPreview![0]!.branches[0]!.sequencedNodes
  .filter((n) => n.kind === "goal")
  .map((n) => n.goal.id);
assert.deepEqual(reorderSeqIds, ["g1", "g2"], "root reorder moves g1 before g2 without promotion");

console.log("tree-edit-map-preview.test.ts: ok");
