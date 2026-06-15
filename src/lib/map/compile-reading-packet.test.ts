import { describe, expect, it } from "vitest";

import {
  buildCategorySignals,
  buildChangeEventsFromDirtyRows,
  buildGapFacts,
  buildMapAggregates,
  buildMilestonePaceFacts,
  computePursuitSignal,
  readingPacketToJson,
  sortPursuitsTemporal,
  thinPacketForMapDepth,
} from "@/lib/map/compile-reading-packet";
import type { ReadingPacket } from "@/lib/map/compile-reading-packet";
import type { ReadingDirtyRow } from "@/lib/map/reading-dirty-ledger";
import {
  DENSE_FIXTURE_NOW,
  DENSE_MAP_CONTEXT,
} from "@/lib/map/__fixtures__/dense-map";
import type { FormattedMapPursuit } from "@/lib/ai/format-map-context";

/** Flatten dense-map fixture the same way compileReadingPacket does. */
function flattenDensePursuits(): Array<
  FormattedMapPursuit & {
    themeId: string;
    themeLabel: string;
    categoryLabel: string;
    categoryId: string;
  }
> {
  const rows: Array<
    FormattedMapPursuit & {
      themeId: string;
      themeLabel: string;
      categoryLabel: string;
      categoryId: string;
    }
  > = [];
  for (const theme of DENSE_MAP_CONTEXT.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        rows.push({
          ...pursuit,
          themeId: theme.id,
          themeLabel: theme.label,
          categoryLabel: hub.section || hub.label,
          categoryId: hub.id,
        });
      }
    }
  }
  return rows;
}

const FIXTURE_NOW = DENSE_FIXTURE_NOW;

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
    const categorySignals = buildCategorySignals(
      twoJobPursuits,
      new Set(["cat-job"]),
      FIXTURE_NOW,
    );
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
    const aggregatesNow = Date.parse("2026-08-20T00:00:00.000Z");
    const aggregates = buildMapAggregates(twoJobPursuits, aggregatesNow);
    expect(aggregates.totalPursuits).toBe(2);
    expect(aggregates.recentCompletions90d).toBe(1);
    expect(aggregates.upcomingDeadlines30d).toBe(1);
    expect(aggregates.upcomingDeadlines14d).toBe(1);
    expect(aggregates.highSignificanceActive).toEqual(["Product Lead search"]);
  });

  it("emits no pace fact when pursuit has milestones but zero completions", () => {
    const facts = buildMilestonePaceFacts(
      [
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
      ],
      FIXTURE_NOW,
    );
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
      gapFacts: [],
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
      FIXTURE_NOW,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toBe(
      "CeMAP qualification: started 6 months ago; deadline in 18d; 0 of 3 milestones completed",
    );
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
      gapFacts: [],
      milestonePaceFacts: [],
    };

    const thinned = thinPacketForMapDepth(packet);
    expect(thinned.recentEvents.past).toEqual([]);
  });

  it("flags CeMAP-shaped pursuit as gap", () => {
    const cemap = flattenDensePursuits().find((p) => p.title === "CeMAP qualification");
    expect(cemap).toBeDefined();
    expect(computePursuitSignal(cemap!, FIXTURE_NOW)).toBe("gap");
  });

  it("flags recent COMPLETE pursuit as arrival", () => {
    const senior = flattenDensePursuits().find((p) => p.title === "Senior Engineer at Acme");
    expect(senior).toBeDefined();
    expect(computePursuitSignal(senior!, FIXTURE_NOW)).toBe("arrival");
  });

  it("does not flag pursuit with milestone progress as gap", () => {
    const lead = flattenDensePursuits().find((p) => p.title === "Product Lead search");
    expect(lead).toBeDefined();
    expect(computePursuitSignal(lead!, FIXTURE_NOW)).toBeNull();
  });

  it("flags Alex fixture gap set at fixed now (CeMAP only)", () => {
    const dense = flattenDensePursuits();
    const gapTitles = dense
      .filter((p) => computePursuitSignal(p, FIXTURE_NOW) === "gap")
      .map((p) => p.title)
      .sort();
    expect(gapTitles).toEqual(["CeMAP qualification"]);
  });

  it("does not flag amount-progress pursuit as gap despite near deadline and no milestones", () => {
    const signal = computePursuitSignal(
      {
        id: "p-debt",
        title: "Clear £10,000 credit card debt",
        description: "",
        status: "ACTIVE",
        significance: 4,
        deadline: "2026-07-01",
        targetAmount: 10000,
        currentAmount: 4200,
        unit: "GBP",
        milestones: [],
      },
      FIXTURE_NOW,
    );
    expect(signal).toBeNull();
  });

  it("sorts Job category done → active by deadline at fixed now", () => {
    const jobPursuits = flattenDensePursuits().filter((p) => p.categoryId === "cat-job");
    const ordered = sortPursuitsTemporal(jobPursuits, FIXTURE_NOW).map((p) => p.title);
    expect(ordered).toEqual([
      "Senior Engineer at Acme",
      "CeMAP qualification",
      "Product Lead search",
    ]);
  });

  it("sorts Savings category by deadline soonest first at fixed now", () => {
    const savings = flattenDensePursuits().filter((p) => p.categoryId === "cat-savings");
    const ordered = sortPursuitsTemporal(savings, FIXTURE_NOW).map((p) => p.title);
    expect(ordered).toEqual([
      "Clear £10,000 credit card debt",
      "Max out pension contributions",
      "£500,000 ISA",
    ]);
  });

  it("builds gap facts for Alex fixture at fixed now", () => {
    const facts = buildGapFacts(flattenDensePursuits(), FIXTURE_NOW);
    expect(facts).toEqual([
      "Significant but stalled: CeMAP qualification (sig 5, deadline 6d, 0 of 2 milestones completed)",
    ]);
  });

  it("forwards amount progress into ReadingPacketPursuit when present", () => {
    const savings = buildCategorySignals(
      flattenDensePursuits(),
      new Set(["cat-savings"]),
      FIXTURE_NOW,
    )[0];
    const debt = savings?.pursuits.find((p) => p.title === "Clear £10,000 credit card debt");
    expect(debt).toMatchObject({
      currentAmount: 4200,
      targetAmount: 10000,
      unit: "GBP",
    });
    expect(debt?.signal).toBeUndefined();

    const isa = savings?.pursuits.find((p) => p.title === "£500,000 ISA");
    expect(isa).toMatchObject({
      currentAmount: 120000,
      targetAmount: 500000,
      unit: "GBP",
    });

    const packet: ReadingPacket = {
      changeEvents: [],
      categorySignals: savings ? [savings] : [],
      recentEvents: { past: [], upcoming: [] },
      mapAggregates: {
        totalPursuits: 3,
        upcomingDeadlines14d: 0,
        upcomingDeadlines30d: 0,
        recentCompletions90d: 0,
        highSignificanceActive: [],
      },
      gapFacts: [],
      milestonePaceFacts: [],
    };
    const json = readingPacketToJson(packet);
    const parsed = JSON.parse(json) as ReadingPacket;
    const serializedDebt = parsed.categorySignals[0]?.pursuits.find(
      (p) => p.title === "Clear £10,000 credit card debt",
    );
    expect(serializedDebt).toMatchObject({
      currentAmount: 4200,
      targetAmount: 10000,
      unit: "GBP",
    });
  });

  it("includes signal and temporal order in category signals at fixed now", () => {
    const job = buildCategorySignals(
      flattenDensePursuits(),
      new Set(["cat-job"]),
      FIXTURE_NOW,
    )[0];
    expect(job?.pursuits.map((p) => p.title)).toEqual([
      "Senior Engineer at Acme",
      "CeMAP qualification",
      "Product Lead search",
    ]);
    expect(job?.pursuits.find((p) => p.title === "Senior Engineer at Acme")?.signal).toBe("arrival");
    expect(job?.pursuits.find((p) => p.title === "CeMAP qualification")?.signal).toBe("gap");
    expect(job?.pursuits.find((p) => p.title === "Product Lead search")?.signal).toBeUndefined();
    expect(job?.facts.some((f) => f.includes("Significant but stalled: CeMAP qualification"))).toBe(
      true,
    );
  });
});
