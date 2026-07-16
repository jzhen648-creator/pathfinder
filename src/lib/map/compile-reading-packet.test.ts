import { describe, expect, it } from "vitest";

import {
  ageAtCalendarDate,
  buildCategorySignals,
  buildChangeEventsFromDirtyRows,
  buildFocalPursuitReadingFacts,
  buildGapFacts,
  buildHighSignificanceActiveTitles,
  buildSilenceFacts,
  buildMapAggregates,
  buildMilestonePaceFacts,
  buildThemeRollup,
  buildReadingPacketRecentEvents,
  computePursuitSignal,
  mapContextForReadingPacketPrompt,
  orderReadingPacketKeys,
  packConfirmedRelationships,
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
import type { FormattedMapContext, FormattedMapPursuit } from "@/lib/ai/format-map-context";

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
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        rows.push({
          ...pursuit,
          themeId: theme.id,
          themeLabel: theme.label,
          categoryLabel: category.categoryLabel || category.label,
          categoryId: category.id,
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
    status: "COMPLETE",
    significance: 3,
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
    status: "ACTIVE",
    significance: 3,
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

  it("selects one theme rep per theme before overflow on PANORAMIC maps", () => {
    const pursuits = [
      {
        id: "w1",
        title: "CeMAP qualification",
        status: "ACTIVE",
        significance: 3,
        deadline: "2026-06-20",
        milestones: [],
        themeId: "work",
        themeLabel: "Work & Career",
        categoryLabel: "Job",
        categoryId: "cat-job",
      },
      {
        id: "w2",
        title: "Product Lead search",
        status: "ACTIVE",
        significance: 3,
        deadline: "2026-06-25",
        milestones: [],
        themeId: "work",
        themeLabel: "Work & Career",
        categoryLabel: "Job",
        categoryId: "cat-job",
      },
      {
        id: "f1",
        title: "£500,000 ISA",
        status: "ACTIVE",
        significance: 3,
        deadline: "2028-12-31",
        targetAmount: 500000,
        currentAmount: 120000,
        unit: "GBP",
        milestones: [],
        themeId: "finance",
        themeLabel: "Money & Finance",
        categoryLabel: "Savings",
        categoryId: "cat-savings",
      },
    ];

    const titles = buildHighSignificanceActiveTitles(pursuits);
    expect(titles.slice(0, 2)).toEqual(["£500,000 ISA", "CeMAP qualification"]);
    expect(titles[2]).toBe("Product Lead search");
  });

  it("builds cross-theme highSignificanceActive for dense fixture at fixed now", () => {
    const aggregates = buildMapAggregates(flattenDensePursuits(), FIXTURE_NOW);
    expect(aggregates.highSignificanceActive).toEqual([
      "£500,000 ISA",
      "CeMAP qualification",
      "London Marathon 2027",
      "Plan wedding",
      "Clear £10,000 credit card debt",
      "Max out pension contributions",
    ]);
  });

  it("serializes mapAggregates before recentEvents in reading packet JSON", () => {
    const packet: ReadingPacket = {
      changeEvents: [],
      categorySignals: [],
      recentEvents: { past: [], upcoming: [] },
      mapAggregates: {
        totalPursuits: 3,
        upcomingDeadlines14d: 0,
        upcomingDeadlines30d: 0,
        recentCompletions90d: 0,
        highSignificanceActive: ["£500,000 ISA"],
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
      milestonePaceFacts: [],
    };
    const keys = Object.keys(JSON.parse(readingPacketToJson(packet)) as ReadingPacket);
    expect(keys.indexOf("mapAggregates")).toBeLessThan(keys.indexOf("recentEvents"));
  });

  it("packs confirmedRelationships from map_context and omits when empty", () => {
    expect(
      packConfirmedRelationships({
        themes: [],
        confirmedRelationships: [
          {
            goalAId: "a",
            goalBId: "b",
            goalATitle: "New Homes Sales Executive",
            goalBTitle: "Mortgage Broker",
            label: "groundwork for",
          },
        ],
      }),
    ).toEqual([
      {
        goalAId: "a",
        goalBId: "b",
        goalATitle: "New Homes Sales Executive",
        goalBTitle: "Mortgage Broker",
        label: "groundwork for",
      },
    ]);
    expect(packConfirmedRelationships({ themes: [] })).toBeUndefined();
    expect(packConfirmedRelationships({ themes: [], confirmedRelationships: [] })).toBeUndefined();
  });

  it("serializes reading packet JSON without confirmedRelationships", () => {
    const packet: ReadingPacket = {
      changeEvents: ["relationship created"],
      categorySignals: [],
      recentEvents: { past: [], upcoming: [] },
      mapAggregates: {
        totalPursuits: 2,
        upcomingDeadlines14d: 0,
        upcomingDeadlines30d: 0,
        recentCompletions90d: 0,
        highSignificanceActive: ["Mortgage Broker"],
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
      milestonePaceFacts: [],
    };
    const parsed = JSON.parse(readingPacketToJson(packet)) as ReadingPacket;
    expect(parsed).not.toHaveProperty("confirmedRelationships");
    expect(Object.keys(parsed)[0]).toBe("changeEvents");
  });

  it("strips confirmedRelationships from map_context for packet-accompanied prompts", () => {
    const stripped = mapContextForReadingPacketPrompt(DENSE_MAP_CONTEXT);
    expect(stripped).not.toHaveProperty("confirmedRelationships");
    expect(stripped.themes).toEqual(DENSE_MAP_CONTEXT.themes);
  });

  it("orderReadingPacketKeys uses stable key order", () => {
    const ordered = orderReadingPacketKeys({
      changeEvents: [],
      categorySignals: [],
      recentEvents: { past: [], upcoming: [] },
      mapAggregates: {
        totalPursuits: 0,
        upcomingDeadlines14d: 0,
        upcomingDeadlines30d: 0,
        recentCompletions90d: 0,
        highSignificanceActive: [],
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
      milestonePaceFacts: [],
    });
    expect(Object.keys(ordered)).toEqual([
      "changeEvents",
      "categorySignals",
      "mapAggregates",
      "recentEvents",
      "gapFacts",
      "silenceFacts",
      "milestonePaceFacts",
    ]);
  });

  it("buildThemeRollup includes every theme with a headline chapter", () => {
    const rollup = buildThemeRollup(flattenDensePursuits());
    expect(rollup.length).toBe(DENSE_MAP_CONTEXT.themes.length);
    expect(rollup.some((row) => row.themeLabel === "Work & Career")).toBe(true);
    expect(rollup.find((row) => row.themeLabel === "Work & Career")?.headlineChapter).toBe(
      "CeMAP qualification",
    );
  });

  it("emits no pace fact when pursuit has milestones but zero completions", () => {
    const facts = buildMilestonePaceFacts(
      [
        {
          id: "c",
          title: "CeMAP qualification",
          status: "ACTIVE",
          significance: 3,
          milestones: [
            { id: "m1", title: "Unit 1", completed: false },
            { id: "m2", title: "Unit 2", completed: false },
          ],
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
          pursuits: [{ title: "CeMAP qualification", status: "ACTIVE", significance: 3 }],
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
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
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
          status: "ACTIVE",
          significance: 3,
          deadline: "2026-07-02",
          timelineStart: "2025-12-14",
          milestones: [
            { id: "m1", title: "Unit 1", completed: false },
            { id: "m2", title: "Unit 2", completed: false },
            { id: "m3", title: "Unit 3", completed: false },
          ],
        },
      ],
      FIXTURE_NOW,
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toBe(
      "CeMAP qualification: started 6 months ago; deadline in 18d; milestones defined (3) with none completed yet",
    );
  });

  it("uses addedToMap wording when timelineStart is unset", () => {
    const facts = buildMilestonePaceFacts(
      [
        {
          id: "c",
          title: "CeMAP qualification",
          status: "ACTIVE",
          significance: 3,
          addedToMap: "2025-12-14",
          milestones: [{ id: "m1", title: "Unit 1", completed: false }],
        },
      ],
      FIXTURE_NOW,
    );
    expect(facts[0]).toMatch(/^CeMAP qualification: added to map 6 months ago;/);
  });

  it("ageAtCalendarDate computes age at an event date", () => {
    const dob = new Date("2007-01-01T00:00:00.000Z");
    expect(ageAtCalendarDate(dob, "2024-06-01")).toBe(17);
    expect(ageAtCalendarDate(dob, "2026-07-04")).toBe(19);
  });

  it("buildFocalPursuitReadingFacts emits age at start when DOB and timelineStart are set", () => {
    const dob = new Date("2007-01-01T00:00:00.000Z");
    const facts = buildFocalPursuitReadingFacts(
      {
        id: "g1",
        title: "Apprenticeship",
        status: "ACTIVE",
        timelineStart: "2024-01-15",
        milestones: [],
      },
      FIXTURE_NOW,
      dob,
    );
    expect(facts).toContain("Timeline started: 2024-01-15");
    expect(facts).toContain("Age at start: 17");
    expect(facts.some((fact) => fact.startsWith("Age at completion:"))).toBe(false);
  });

  it("buildFocalPursuitReadingFacts omits age at start when only addedToMap is present", () => {
    const dob = new Date("2007-01-01T00:00:00.000Z");
    const facts = buildFocalPursuitReadingFacts(
      {
        id: "g1",
        title: "Apprenticeship",
        status: "ACTIVE",
        addedToMap: "2026-01-15",
        milestones: [],
      },
      FIXTURE_NOW,
      dob,
    );
    expect(facts).toContain("Added to map: 2026-01-15");
    expect(facts.some((fact) => fact.startsWith("Age at start:"))).toBe(false);
  });

  it("buildReadingPacketRecentEvents excludes milestone_complete from reading spine", () => {
    const mapContext: FormattedMapContext = {
      themes: [
        {
          id: "work",
          label: "Work & Career",
          marks: [],
          categories: [
            {
              id: "cat-job",
              label: "Job",
              categoryLabel: "Job",
              marks: [],
              pursuits: [
                {
                  id: "p-cemap",
                  title: "CeMAP qualification",
                  status: "ACTIVE",
                  significance: 3,
                  deadline: "2026-06-20",
                  milestones: [
                    {
                      id: "m1",
                      title: "Unit 1",
                      completed: true,
                      completedAt: "2026-05-01",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const events = buildReadingPacketRecentEvents(mapContext, FIXTURE_NOW);
    expect(events.past.some((e) => e.kind === "milestone_complete")).toBe(false);
  });

  it("does not flag arrival or reading spine when goal.completedAt is stale but milestones are recent", () => {
    const now = Date.parse("2026-06-20T12:00:00.000Z");
    const cemap: FormattedMapPursuit = {
      id: "cemap",
      title: "CeMAP Qualification",
      status: "COMPLETE",
      significance: 3,
      completedAt: "2025-07-01",
      milestones: [
        { id: "m1", title: "Module 1", completed: true, completedAt: "2026-06-19" },
        { id: "m2", title: "Module 2", completed: true, completedAt: "2026-06-19" },
      ],
    };

    expect(computePursuitSignal(cemap, now)).toBeNull();

    const mapContext: FormattedMapContext = {
      themes: [
        {
          id: "work",
          label: "Work & Career",
          marks: [],
          categories: [
            {
              id: "cat-job",
              label: "Job",
              categoryLabel: "Job",
              marks: [],
              pursuits: [
                cemap,
                {
                  id: "nhse",
                  title: "New Homes Sales Executive",
                  status: "COMPLETE",
                  significance: 3,
                  completedAt: "2024-06-20",
                  milestones: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const events = buildReadingPacketRecentEvents(mapContext, now);
    expect(events.past.some((e) => e.kind === "pursuit_complete")).toBe(false);
    expect(events.past.some((e) => e.kind === "milestone_complete")).toBe(false);
  });

  it("drops pursuit_complete spine when recentCompletions90d is 0", () => {
    const packet: ReadingPacket = {
      changeEvents: [],
      categorySignals: [],
      recentEvents: {
        past: [
          {
            kind: "pursuit_complete",
            date: "2026-06-01",
            placement: "past",
            title: "Old win",
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
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
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
        status: "ACTIVE",
        significance: 3,
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
      "Significant but stalled: CeMAP qualification (sig 3, deadline 6d, 0 of 2 milestones completed)",
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
        themeRollup: [],
      },
      gapFacts: [],
      silenceFacts: [],
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

describe("buildSilenceFacts", () => {
  function pursuitWithSilence(
    title: string,
    status: string,
    daysSinceTouched?: number,
  ): FormattedMapPursuit {
    const row: FormattedMapPursuit = { id: title, title, status, milestones: [] };
    if (daysSinceTouched != null) row.daysSinceTouched = daysSinceTouched;
    return row;
  }

  it("names quiet in-progress chapters past threshold, longest silence first", () => {
    const facts = buildSilenceFacts([
      pursuitWithSilence("Fresh chapter", "ACTIVE", 10),
      pursuitWithSilence("Quiet run", "ACTIVE", 74),
      pursuitWithSilence("Silent saving", "MAINTAINING", 140),
      pursuitWithSilence("Deliberate pause", "PAUSED", 300),
      pursuitWithSilence("Done long ago", "COMPLETE", 300),
      pursuitWithSilence("No timestamp", "ACTIVE"),
    ]);
    expect(facts).toEqual([
      'Quiet chapter: "Silent saving" (Maintaining) — last touched 140d ago',
      'Quiet chapter: "Quiet run" (Active) — last touched 74d ago',
    ]);
  });

  it("respects thresholds: ACTIVE 60d, MAINTAINING 120d", () => {
    expect(
      buildSilenceFacts([
        pursuitWithSilence("Almost", "ACTIVE", 59),
        pursuitWithSilence("Maintained recently enough", "MAINTAINING", 119),
      ]),
    ).toEqual([]);
  });

  it("caps at six lines", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      pursuitWithSilence(`Chapter ${i}`, "ACTIVE", 61 + i),
    );
    expect(buildSilenceFacts(many)).toHaveLength(6);
  });
});

describe("recentEvents season merge", () => {
  it("merges season events into past, sorted by date desc, within the cap", () => {
    const seasonEvents = [
      {
        kind: "pursuit_returned" as const,
        date: "2026-06-10",
        placement: "past" as const,
        pausedDays: 94,
        title: "London Marathon 2027",
        themeId: "health",
        themeLabel: "Health & Body",
      },
    ];
    const events = buildReadingPacketRecentEvents(DENSE_MAP_CONTEXT, FIXTURE_NOW, seasonEvents);
    const returned = events.past.find((e) => e.kind === "pursuit_returned");
    expect(returned?.pausedDays).toBe(94);
    expect(events.past.length).toBeLessThanOrEqual(12);
    const dates = events.past.map((e) => e.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});
