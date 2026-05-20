import assert from "node:assert/strict";
import {
  flattenGoalsById,
  goalPursuitDepth,
  milestoneConnectorStrokeProps,
  pursuitConnectorStrokeWidth,
} from "./tree-connector-strokes";
import type { TreeGoalNode } from "./tree-types";

function goal(id: string, parentGoalId: string | null, children: TreeGoalNode[] = []): TreeGoalNode {
  return {
    id,
    branchId: "branch-test",
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
    childGoals: children,
  };
}

const root = goal("r", null, [goal("c", "r", [goal("gc", "c")])]);
const byId = flattenGoalsById([root]);

assert.equal(goalPursuitDepth("r", byId), 1);
assert.equal(goalPursuitDepth("c", byId), 2);
assert.equal(goalPursuitDepth("gc", byId), 3);
assert.equal(pursuitConnectorStrokeWidth(1), 2.5);
assert.equal(pursuitConnectorStrokeWidth(2), 1.5);
assert.equal(pursuitConnectorStrokeWidth(3), 1);
assert.equal(pursuitConnectorStrokeWidth(9), 1);
assert.deepEqual(milestoneConnectorStrokeProps(), {
  strokeWidth: 0.75,
  strokeDasharray: "3 3",
});

console.log("tree-connector-strokes.test.ts: ok");
