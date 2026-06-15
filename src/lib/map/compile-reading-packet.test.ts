import { describe, expect, it } from "vitest";

import {
  buildCategorySignals,
  buildChangeEventsFromDirtyRows,
  buildMapAggregates,
  buildMilestonePaceFacts,
  thinPacketForMapDepth,
} from "@/lib/map/compile-reading-packet";
import type { ReadingPacket } from "@/lib/map/compile-reading-packet";
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

  it("emits no pace fact when pursuit has milestones but zero completions", () => {
    const facts = buildMilestonePaceFacts([
      {
        id: "c",
        title: "CeMAP qualification",
        description: "",
        status: "ACTIVE",
        significance: 5,
        milestones: [
          { id: "m1", title: "Unit 1", completed: false },
          { id: "m2", title: "Unit 2", completed: false },
        ],
        themeId: "work",
        themeLabel: "Work & Career",
        categoryLabel: "Job",
        categoryId: "cat-job",
      },
    ]);
    expect(facts).toEqual([]);
  });

  it("keeps category signal facts on a 1–2 pursuit map", () => {
    const packet: ReadingPacket = {
      changeEvents: [],
      categorySignals: [
        {
          themeLabel: "Work & Career",
          categoryLabel: "Job",
          byStatus: { ACTIVE: 1 },
          pursuits: [{ title: "CeMAP qualification", status: "ACTIVE", significance: 5 }],
          facts: ["Work & Career · Job: 1 in progress"],
        },
      ],
      recentEvents: { past: [], upcoming: [] },
      mapAggregates: {
        totalPursuits: 1,
        upcomingDeadlines14d: 1,
        upcomingDeadlines30d: 1,
        recentCompletions90d: 0,
        highSignificanceActive: ["CeMAP qualification"],
      },
      milestonePaceFacts: [],
    };

    const thinned = thinPacketForMapDepth(packet);
    expect(thinned.categorySignals[0]?.facts).toEqual(["Work & Career · Job: 1 in progress"]);
    expect(thinned.recentEvents.past).toEqual([]);
    expect(thinned.mapAggregates.highSignificanceActive).toEqual(["CeMAP qualification"]);
  });

  it("emits pace fact at zero completions when timelineStart is set", () => {
    const facts = buildMilestonePaceFacts(
      [
        {
          id: "c",
          title: "CeMAP qualification",
          description: "",
          status: "ACTIVE",
          significance: 5,
          deadline: "2026-07-02",
          timelineStart: "2025-12-14",
          milestones: [
            { id: "m1", title: "Unit 1", completed: false },
            { id: "m2", title: "Unit 2", completed: false },
            { id: "m3", title: "Unit 3", completed: false },
          ],
          themeId: "work",
          themeLabel: "Work & Career",
          categoryLabel: "Job",
          categoryId: "cat-job",
        },
      ],
      Date.parse("2026-06-14T12:00:00.000Z"),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatch(/^CeMAP qualification: started \d+ months ago; deadline in \d+d; 0 of 3 milestones completed$/);
  });

  it("omits arrival spine when map has zero recent completions", () => {
    const packet: ReadingPacket = {
      changeEvents: [],
      categorySignals: [],
      recentEvents: {
        past: [
          {
            kind: "milestone_complete",
            date: "2026-05-01",
            placement: "past",
            title: "Done",
            themeId: "work",
            themeLabel: "Work & Career",
          },
        ],
        upcoming: [],
      },
      mapAggregates: {
        totalPursuits: 5,
        upcomingDeadlines14d: 0,
        upcomingDeadlines30d: 0,
        recentCompletions90d: 0,
        highSignificanceActive: [],
      },
      milestonePaceFacts: [],
    };

    const thinned = thinPacketForMapDepth(packet);
    expect(thinned.recentEvents.past).toEqual([]);
  });
});
