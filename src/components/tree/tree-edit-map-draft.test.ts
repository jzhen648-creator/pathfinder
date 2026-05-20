import assert from "node:assert/strict";
import { dropTargetToDraftOp, isEditMapDropNoop } from "./tree-edit-map-draft";
import type { EditDragGoalPayload } from "./tree-edit-drag";
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

const thread: DomainHubData = {
  id: "b1",
  type: "Test hub",
  goals: [goal("g1", "b1", null), goal("g2", "b1", null)],
  moments: [],
  sequencedNodes: [
    { kind: "goal", id: "g1", sequencePosition: 100, goal: goal("g1", "b1", null) },
    { kind: "goal", id: "g2", sequencePosition: 200, goal: goal("g2", "b1", null) },
  ],
};

const areas: AreaData[] = [
  {
    id: "a1",
    label: "Theme",
    color: "#fff",
    summary: null,
    branches: [thread],
  },
];

const dragged: EditDragGoalPayload = {
  goalId: "g1",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: null,
  areaColor: "#fff",
  title: "First",
};

assert.equal(
  isEditMapDropNoop(dragged, { kind: "hub", branchId: "b1", areaId: "a1", x: 0, y: 0, radius: 52 }, areas),
  true,
);

assert.equal(
  dropTargetToDraftOp(
    dragged,
    { kind: "hub", branchId: "b1", areaId: "a1", x: 0, y: 0, radius: 52 },
    areas,
  ),
  null,
);

const continuationDragged: EditDragGoalPayload = {
  goalId: "g-child",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: "g-parent",
  areaColor: "#fff",
  title: "Child",
};

assert.equal(
  dropTargetToDraftOp(
    continuationDragged,
    { kind: "hub", branchId: "b2", areaId: "a1", x: 0, y: 0, radius: 52 },
    areas,
  ),
  null,
  "continuation child cross-hub hub drop produces no draft op",
);

console.log("tree-edit-map-draft.test.ts: ok");
