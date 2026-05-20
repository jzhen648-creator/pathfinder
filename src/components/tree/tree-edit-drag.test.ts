import assert from "node:assert/strict";
import { editDropTargetKey, hitTestDropTarget } from "./tree-edit-drag";
import type { EditDragGoalPayload, EditDropTarget } from "./tree-edit-drag";

const goalsById = new Map();

function pursuit(
  x: number,
  y: number,
  goalId: string,
  intent: Extract<EditDropTarget, { kind: "pursuit" }>["intent"],
  radius = 38,
): EditDropTarget {
  return {
    kind: "pursuit",
    goalId,
    areaId: "a1",
    branchId: "b1",
    x,
    y,
    radius,
    intent,
  };
}

assert.equal(
  hitTestDropTarget(
    [
      pursuit(100, 100, "g-parent", { type: "nestUnder", parentGoalId: "g-parent" }, 26),
      pursuit(100, 100, "g-before", { type: "insertBefore", anchor: { kind: "before", nodeId: "g-before" } }),
    ],
    100,
    100,
    "g-drag",
    goalsById,
  )?.kind,
  "pursuit",
  "inner nest ring wins at center over outer sequence ring",
);

assert.equal(
  (
    hitTestDropTarget(
      [
        pursuit(100, 100, "g-parent", { type: "nestUnder", parentGoalId: "g-parent" }, 26),
        pursuit(100, 100, "g-before", { type: "insertBefore", anchor: { kind: "before", nodeId: "g-before" } }),
      ],
      140,
      100,
      "g-drag",
      goalsById,
    ) as Extract<EditDropTarget, { kind: "pursuit" }>
  ).intent.type,
  "insertBefore",
  "outer sequence ring wins near edge of concentric pursuit rings",
);

function hub(branchId: string, x: number, y: number): EditDropTarget {
  return { kind: "hub", branchId, areaId: "a1", x, y, radius: 52 };
}

const continuationDragged: EditDragGoalPayload = {
  goalId: "g-child",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: "g-parent",
  areaColor: "#fff",
  title: "Child",
};

assert.equal(
  hitTestDropTarget([hub("b2", 100, 100)], 100, 100, "g-child", goalsById, continuationDragged),
  null,
  "continuation child ignores cross-hub hub target",
);

assert.equal(
  hitTestDropTarget(
    [pursuit(100, 100, "g-parent", { type: "nestUnder", parentGoalId: "g-parent" }, 26)],
    100,
    100,
    "g-child",
    goalsById,
    continuationDragged,
  )?.kind,
  "pursuit",
  "continuation child still hits same-hub nest ring",
);

assert.equal(
  hitTestDropTarget([hub("b1", 100, 100), pursuit(120, 100, "g-parent", { type: "nestUnder", parentGoalId: "g-parent" }, 26)], 110, 100, "g-child", goalsById, continuationDragged)
    ?.kind,
  "hub",
  "continuation hub distance bias wins over moderately closer nest ring",
);

const rootDragged: EditDragGoalPayload = {
  goalId: "g-drag",
  areaId: "a1",
  branchId: "b1",
  parentGoalId: null,
  areaColor: "#fff",
  title: "Root",
};

assert.equal(
  hitTestDropTarget([hub("b1", 100, 100), pursuit(108, 100, "g-parent", { type: "nestUnder", parentGoalId: "g-parent" }, 26)], 106, 100, "g-drag", goalsById, rootDragged)
    ?.kind,
  "pursuit",
  "root drag unchanged: pursuit nest wins when closer than hub",
);

assert.equal(
  hitTestDropTarget(
    [pursuit(50, 50, "g-tail", { type: "appendContinuationChain", parentGoalId: "g-tail" })],
    50,
    50,
    "g-drag",
    goalsById,
  )?.kind,
  "pursuit",
  "continuation chain append ring is hittable",
);

assert.equal(
  editDropTargetKey(
    pursuit(0, 0, "g1", { type: "insertBefore", anchor: { kind: "before", nodeId: "g1" } }),
  ),
  editDropTargetKey(
    pursuit(5, 5, "g1", { type: "insertBefore", anchor: { kind: "before", nodeId: "g1" } }),
  ),
  "pursuit key ignores screen position",
);

console.log("tree-edit-drag.test.ts: ok");
