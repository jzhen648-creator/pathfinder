import assert from "node:assert/strict";

import {
  buildCategorySignals,
  buildChangeEventsFromDirtyRows,
  buildMapAggregates,
} from "@/lib/map/compile-reading-packet";
import type { ReadingDirtyRow } from "@/lib/map/reading-dirty-ledger";

const twoJobPursuits = [
  {
    id: "a",
    title: "Senior Engineer at Acme",
    description: "",
    status: "COMPLETE",
    significance: 4,
    milestones: [],
    themeId: "work",
    themeLabel: "Work & Career",
    categoryLabel: "Job",
    categoryId: "cat-job",
  },
  {
    id: "b",
    title: "Product Lead search",
    description: "",
    status: "ACTIVE",
    significance: 5,
    deadline: "2026-09-01",
    milestones: [],
    themeId: "work",
    themeLabel: "Work & Career",
    categoryLabel: "Job",
    categoryId: "cat-job",
  },
];

const categorySignals = buildCategorySignals(twoJobPursuits, new Set(["cat-job"]));
assert.equal(categorySignals.length, 1);
assert.ok(categorySignals[0]?.facts.some((f) => f.includes("1 complete and 1 in progress")));
assert.ok(categorySignals[0]?.facts.some((f) => f.includes("Product Lead search")));

const statusChangeRows: ReadingDirtyRow[] = [
  {
    entityType: "pursuit",
    entityId: "a",
    reason: "pursuit_updated",
    details: {
      title: "Senior Engineer at Acme",
      changes: [{ field: "status", from: "ACTIVE", to: "COMPLETE" }],
    },
  },
];

const changeEvents = buildChangeEventsFromDirtyRows(statusChangeRows);
assert.equal(
  changeEvents[0],
  '"Senior Engineer at Acme": status ACTIVE → COMPLETE',
);

const aggregates = buildMapAggregates(twoJobPursuits, Date.parse("2026-08-20T00:00:00.000Z"));
assert.equal(aggregates.totalPursuits, 2);
assert.equal(aggregates.recentCompletions, 1);
assert.equal(aggregates.upcomingDeadlines30d, 1);
assert.equal(aggregates.upcomingDeadlines14d, 1);
assert.deepEqual(aggregates.highSignificanceActive, ["Product Lead search"]);

console.log("compile-reading-packet.test.ts ok");
