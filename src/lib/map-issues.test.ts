import assert from "node:assert/strict";
import type { AreaData, DomainHubData, MomentNode, TreeGoalNode } from "@/components/tree/tree-types";
import type { RawMark, RawTreeGoalPayload } from "@/components/tree/tree-data";
import { deriveMapIssues, MAP_ISSUE_LABELS } from "./map-issues";

function goalNode(
  overrides: Partial<TreeGoalNode> & Pick<TreeGoalNode, "id" | "title">,
): TreeGoalNode {
  return {
    branchId: "hub-1",
    shortLabel: "Short label",
    description: null,
    year: null,
    createdAtIso: "2024-01-01",
    timelineStartIso: "2024-06-01",
    deadlineIso: "2025-12-31",
    bloomStatus: "ACTIVE",
    positionAngle: null,
    parentGoalId: null,
    forkedGoalIds: [],
    milestones: [{ id: "ms1", title: "Step one", position: 0, subtasks: [] }],
    orbitalMilestones: [],
    childGoals: [],
    ...overrides,
  };
}

function momentNode(overrides: Partial<MomentNode> & Pick<MomentNode, "id">): MomentNode {
  return {
    branchId: "hub-1",
    label: "Note",
    description: null,
    year: null,
    significance: 2,
    bloomStatus: "ACTIVE",
    isTurningPoint: false,
    future: false,
    value: null,
    type: "mark",
    ...overrides,
  };
}

function hub(overrides: Partial<DomainHubData> & Pick<DomainHubData, "id">): DomainHubData {
  return {
    type: "Career",
    moments: [],
    goals: [],
    sequencedNodes: [],
    ...overrides,
  };
}

function area(overrides: Partial<AreaData> & Pick<AreaData, "id">): AreaData {
  return {
    label: "Work & Career",
    color: "#000",
    summary: null,
    branches: [hub({ id: "hub-1" })],
    ...overrides,
  };
}

const baseGoals: RawTreeGoalPayload[] = [];

function derive(
  areas: AreaData[],
  goals: RawTreeGoalPayload[] = baseGoals,
  marks: RawMark[] = [],
) {
  return deriveMapIssues({ areas, goals, marks });
}

// mark_needs_resolution
{
  const snap = derive(
    [area({ id: "work" })],
    [],
    [{ id: "m1", branchId: "hub-1", title: "Uncertain note", needsResolution: true }],
  );
  assert.equal(snap.total, 1);
  assert.equal(snap.issues[0]?.kind, "mark_needs_resolution");
  assert.equal(snap.issues[0]?.description, MAP_ISSUE_LABELS.mark_needs_resolution);
  assert.equal(snap.issues[0]?.target.entity, "mark");
}

// archived marks excluded
{
  const snap = derive(
    [area({ id: "work" })],
    [],
    [{ id: "m1", branchId: "hub-1", archived: true, needsResolution: true }],
  );
  assert.equal(snap.byKind.mark_needs_resolution, 0);
}

// pursuit_missing_deadline — no deadline and no milestones
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          goals: [
            goalNode({
              id: "g1",
              title: "Open-ended",
              deadlineIso: null,
              year: null,
              milestones: [],
            }),
          ],
        }),
      ],
    }),
  ]);
  assert.equal(snap.byKind.pursuit_missing_deadline, 1);
  assert.equal(snap.issues[0]?.kind, "pursuit_missing_deadline");
  assert.equal(snap.issues[0]?.description, MAP_ISSUE_LABELS.pursuit_missing_deadline);
}

// pursuit_missing_deadline skipped when milestones exist
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          goals: [
            goalNode({
              id: "g1b",
              title: "Has milestones",
              deadlineIso: null,
              year: null,
              milestones: [{ id: "m1", title: "First", position: 0, subtasks: [] }],
            }),
          ],
        }),
      ],
    }),
  ]);
  assert.equal(snap.byKind.pursuit_missing_deadline, 0);
}

// pursuit_missing_deadline skipped when deadlineIso set
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          goals: [
            goalNode({
              id: "g1c",
              title: "Has deadline",
              deadlineIso: "2026-06-01",
              milestones: [],
            }),
          ],
        }),
      ],
    }),
  ]);
  assert.equal(snap.byKind.pursuit_missing_deadline, 0);
}

// mark_missing_date
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          moments: [momentNode({ id: "m2", label: "Undated", calendarDateIso: null })],
        }),
      ],
    }),
  ]);
  assert.equal(snap.byKind.mark_missing_date, 1);
}

// pursuit_missing_short_label
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          goals: [goalNode({ id: "g2", title: "Long title", shortLabel: null })],
        }),
      ],
    }),
  ]);
  assert.equal(snap.byKind.pursuit_missing_short_label, 1);
}

// broken_continuation_chain
{
  const parent: RawTreeGoalPayload = {
    id: "parent",
    branchId: "hub-1",
    title: "Parent pursuit",
    goalType: "goal",
    bloomStatus: "ACTIVE",
    positionAngle: null,
    parentGoalId: null,
    milestones: [],
    forkedGoals: [],
  };
  const child: RawTreeGoalPayload = {
    id: "child",
    branchId: "hub-2",
    title: "Child pursuit",
    goalType: "goal",
    bloomStatus: "ACTIVE",
    positionAngle: null,
    parentGoalId: "parent",
    milestones: [],
    forkedGoals: [],
  };
  const snap = derive(
    [
      area({
        id: "work",
        branches: [
          hub({ id: "hub-1", goals: [goalNode({ id: "parent", title: "Parent pursuit", branchId: "hub-1" })] }),
          hub({ id: "hub-2", goals: [goalNode({ id: "child", title: "Child pursuit", branchId: "hub-2", parentGoalId: "parent" })] }),
        ],
      }),
    ],
    [parent, child],
  );
  assert.equal(snap.byKind.broken_continuation_chain, 1);
  assert.equal(snap.issues[0]?.target.entity, "goal");
  assert.equal(snap.issues[0]?.id, "broken_continuation_chain:child");
}

function roadmapGoal(
  overrides: Partial<RawTreeGoalPayload> & Pick<RawTreeGoalPayload, "id" | "title" | "branchId">,
): RawTreeGoalPayload {
  return {
    goalType: "goal",
    bloomStatus: "ACTIVE",
    positionAngle: null,
    parentGoalId: null,
    milestones: [],
    forkedGoals: [],
    ...overrides,
  };
}

// continuation_date_order — child deadline before parent
{
  const parent = roadmapGoal({
    id: "parent",
    branchId: "hub-1",
    title: "Parent pursuit",
    deadline: "2027-12-31",
  });
  const child = roadmapGoal({
    id: "child",
    branchId: "hub-1",
    title: "Child pursuit",
    parentGoalId: "parent",
    deadline: "2026-10-31",
  });
  const snap = derive(
    [
      area({
        id: "work",
        branches: [
          hub({
            id: "hub-1",
            goals: [
              goalNode({ id: "parent", title: "Parent pursuit", branchId: "hub-1" }),
              goalNode({
                id: "child",
                title: "Child pursuit",
                branchId: "hub-1",
                parentGoalId: "parent",
              }),
            ],
          }),
        ],
      }),
    ],
    [parent, child],
  );
  assert.equal(snap.byKind.continuation_date_order, 1);
  assert.equal(snap.issues[0]?.id, "continuation_date_order:child");
  assert.equal(snap.issues[0]?.description, MAP_ISSUE_LABELS.continuation_date_order);
}

// continuation_date_order — child deadline after parent
{
  const parent = roadmapGoal({
    id: "parent",
    branchId: "hub-1",
    title: "Parent pursuit",
    deadline: "2026-10-31",
  });
  const child = roadmapGoal({
    id: "child",
    branchId: "hub-1",
    title: "Child pursuit",
    parentGoalId: "parent",
    deadline: "2027-12-31",
  });
  const snap = derive(
    [
      area({
        id: "work",
        branches: [
          hub({
            id: "hub-1",
            goals: [
              goalNode({ id: "parent", title: "Parent pursuit", branchId: "hub-1" }),
              goalNode({
                id: "child",
                title: "Child pursuit",
                branchId: "hub-1",
                parentGoalId: "parent",
              }),
            ],
          }),
        ],
      }),
    ],
    [parent, child],
  );
  assert.equal(snap.byKind.continuation_date_order, 0);
}

// continuation_date_order — no dates
{
  const parent = roadmapGoal({
    id: "parent",
    branchId: "hub-1",
    title: "Parent pursuit",
  });
  const child = roadmapGoal({
    id: "child",
    branchId: "hub-1",
    title: "Child pursuit",
    parentGoalId: "parent",
  });
  const snap = derive(
    [
      area({
        id: "work",
        branches: [
          hub({
            id: "hub-1",
            goals: [
              goalNode({ id: "parent", title: "Parent pursuit", branchId: "hub-1" }),
              goalNode({
                id: "child",
                title: "Child pursuit",
                branchId: "hub-1",
                parentGoalId: "parent",
              }),
            ],
          }),
        ],
      }),
    ],
    [parent, child],
  );
  assert.equal(snap.byKind.continuation_date_order, 0);
}

// continuation_date_order — cross-hub parent/child
{
  const parent = roadmapGoal({
    id: "parent",
    branchId: "hub-1",
    title: "Parent pursuit",
    deadline: "2027-12-31",
  });
  const child = roadmapGoal({
    id: "child",
    branchId: "hub-2",
    title: "Child pursuit",
    parentGoalId: "parent",
    deadline: "2026-10-31",
  });
  const snap = derive(
    [
      area({
        id: "work",
        branches: [
          hub({ id: "hub-1", goals: [goalNode({ id: "parent", title: "Parent pursuit", branchId: "hub-1" })] }),
          hub({
            id: "hub-2",
            goals: [
              goalNode({
                id: "child",
                title: "Child pursuit",
                branchId: "hub-2",
                parentGoalId: "parent",
              }),
            ],
          }),
        ],
      }),
    ],
    [parent, child],
  );
  assert.equal(snap.byKind.continuation_date_order, 0);
  assert.equal(snap.byKind.broken_continuation_chain, 1);
}

// synthetic marks skipped
{
  const snap = derive([
    area({
      id: "work",
      branches: [
        hub({
          id: "hub-1",
          moments: [momentNode({ id: "syn", synthetic: true, calendarDateIso: null })],
        }),
      ],
    }),
  ]);
  assert.equal(snap.total, 0);
}

console.log("map-issues.test.ts: ok");
