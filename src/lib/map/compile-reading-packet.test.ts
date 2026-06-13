import { describe, expect, it } from "vitest";

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
    completedAt: "2026-08-01",
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

describe("compile-reading-packet", () => {
  it("builds category signals for dirty categories", () => {
    const categorySignals = buildCategorySignals(twoJobPursuits, new Set(["cat-job"]));
    expect(categorySignals).toHaveLength(1);
    expect(categorySignals[0]?.facts.some((f) => f.includes("1 complete and 1 in progress"))).toBe(
      true,
    );
    expect(categorySignals[0]?.facts.some((f) => f.includes("Product Lead search"))).toBe(true);
  });

  it("formats status change events from dirty rows", () => {
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
    expect(changeEvents[0]).toBe('"Senior Engineer at Acme": status ACTIVE → COMPLETE');
  });

  it("aggregates map stats for reading packet", () => {
    const aggregates = buildMapAggregates(
      twoJobPursuits,
      Date.parse("2026-08-20T00:00:00.000Z"),
    );
    expect(aggregates.totalPursuits).toBe(2);
    expect(aggregates.recentCompletions90d).toBe(1);
    expect(aggregates.upcomingDeadlines30d).toBe(1);
    expect(aggregates.upcomingDeadlines14d).toBe(1);
    expect(aggregates.highSignificanceActive).toEqual(["Product Lead search"]);
  });
});
