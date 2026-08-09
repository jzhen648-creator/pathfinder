import { describe, expect, it } from "vitest";
import { buildLivingTreeProjection } from "@/lib/living-tree/build-projection";
import { buildFoundations } from "@/lib/living-tree/foundations";
import type {
  FoundationObservationInput,
  LivingTreeChapterInput,
  LivingTreeGroupInput,
  LivingTreeProjectionInput,
} from "@/lib/living-tree/types";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

function group(
  id: string,
  slot: number | null,
  overrides: Partial<LivingTreeGroupInput> = {},
): LivingTreeGroupInput {
  return {
    id,
    name: `Group ${id}`,
    slot,
    archivedAt: null,
    version: 1,
    createdAt: day(1),
    ...overrides,
  };
}

function chapter(
  goalId: string,
  overrides: Partial<LivingTreeChapterInput> = {},
): LivingTreeChapterInput {
  return {
    goalId,
    title: `Chapter ${goalId}`,
    status: "ACTIVE",
    createdAt: day(1),
    citedObservationCount: 1,
    latestConfirmed: null,
    ...overrides,
  };
}

function input(overrides: Partial<LivingTreeProjectionInput> = {}): LivingTreeProjectionInput {
  return {
    groups: [],
    chapters: [],
    memberships: [],
    backgroundObservations: [],
    ...overrides,
  };
}

function background(
  id: string,
  overrides: Partial<FoundationObservationInput> = {},
): FoundationObservationInput {
  return {
    id,
    backgroundCategory: "IDENTITY",
    subjectType: "USER",
    subjectLabel: null,
    canonicalKey: null,
    ...overrides,
  };
}

describe("buildLivingTreeProjection", () => {
  it("F-01 renders an empty model without inventing anything", () => {
    const projection = buildLivingTreeProjection(input());
    expect(projection.visibleGroups).toEqual([]);
    expect(projection.overflowGroups).toEqual([]);
    expect(projection.ungroupedChapters).toEqual([]);
    expect(projection.freeSlots).toEqual([1, 2, 3, 4, 5]);
    expect(projection.totals.visibleGroups).toBe(0);
  });

  it("F-02 shows five groups and reconciles the chapter count", () => {
    const groups = [1, 2, 3, 4, 5].map((slot) => group(`g${slot}`, slot));
    const chapters = Array.from({ length: 11 }, (_, i) => chapter(`c${i}`));
    const memberships = chapters.map((c, i) => ({
      goalId: c.goalId,
      groupId: `g${(i % 5) + 1}`,
    }));

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));

    expect(projection.totals.visibleGroups).toBe(5);
    expect(projection.totals.visibleChapters).toBe(11);
    expect(projection.totals.ungroupedChapters).toBe(0);
    expect(projection.freeSlots).toEqual([]);
    expect(projection.visibleGroups.map((g) => g.slot)).toEqual([1, 2, 3, 4, 5]);
  });

  it("F-03 keeps a twelve-group model reachable, five visible and seven in overflow", () => {
    const groups = [
      ...[1, 2, 3, 4, 5].map((slot) => group(`v${slot}`, slot)),
      ...Array.from({ length: 7 }, (_, i) => group(`o${i}`, null, { createdAt: day(10 + i) })),
    ];
    const chapters = groups.map((g) => chapter(`c-${g.id}`));
    const memberships = chapters.map((c) => ({ goalId: c.goalId, groupId: c.goalId.slice(2) }));

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));

    expect(projection.totals.visibleGroups).toBe(5);
    expect(projection.totals.overflowGroups).toBe(7);
    const reachable =
      projection.totals.visibleChapters +
      projection.totals.overflowChapters +
      projection.totals.ungroupedChapters;
    expect(reachable).toBe(chapters.length);
  });

  it("F-04 leaves unused slots visibly free instead of padding", () => {
    const groups = [group("a", 1), group("b", 3)];
    const projection = buildLivingTreeProjection(input({ groups }));
    expect(projection.visibleGroups.map((g) => g.slot)).toEqual([1, 3]);
    expect(projection.freeSlots).toEqual([2, 4, 5]);
  });

  it("F-05 reports cited counts and the latest confirmed change per group", () => {
    const older = { observationId: "o1", text: "Started the CeMAP course", confirmedAt: day(2) };
    const newer = { observationId: "o2", text: "Passed CeMAP", confirmedAt: day(9) };
    const groups = [group("career", 1)];
    const chapters = [
      chapter("c1", { citedObservationCount: 3, latestConfirmed: older }),
      chapter("c2", { citedObservationCount: 5, latestConfirmed: newer }),
    ];
    const memberships = chapters.map((c) => ({ goalId: c.goalId, groupId: "career" }));

    const [view] = buildLivingTreeProjection(input({ groups, chapters, memberships })).visibleGroups;

    expect(view.citedObservationCount).toBe(8);
    expect(view.latestConfirmedChange).toEqual(newer);
    expect(view.chapters).toHaveLength(2);
  });

  it("F-06 never promotes an overflow group into a free slot on read", () => {
    const groups = [group("visible", 1), group("waiting", null)];
    const projection = buildLivingTreeProjection(input({ groups }));

    expect(projection.visibleGroups.map((g) => g.id)).toEqual(["visible"]);
    expect(projection.overflowGroups.map((g) => g.id)).toEqual(["waiting"]);
    expect(projection.freeSlots).toEqual([2, 3, 4, 5]);
  });

  it("F-11 keeps a chapter findable when its group is archived", () => {
    const groups = [group("archived", null, { archivedAt: day(5) })];
    const chapters = [chapter("orphan")];
    const memberships = [{ goalId: "orphan", groupId: "archived" }];

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));

    expect(projection.visibleGroups).toEqual([]);
    expect(projection.overflowGroups).toEqual([]);
    expect(projection.ungroupedChapters.map((c) => c.goalId)).toEqual(["orphan"]);
  });

  it("F-12 lists a chapter with no membership as ungrouped", () => {
    const chapters = [chapter("solo")];
    const projection = buildLivingTreeProjection(input({ chapters }));
    expect(projection.ungroupedChapters.map((c) => c.goalId)).toEqual(["solo"]);
    expect(projection.totals.ungroupedChapters).toBe(1);
  });

  it("F-19 is deterministic regardless of input order", () => {
    const groups = [group("b", null, { createdAt: day(3) }), group("a", null, { createdAt: day(3) })];
    const chapters = [chapter("c1"), chapter("c2")];
    const memberships = [
      { goalId: "c1", groupId: "a" },
      { goalId: "c2", groupId: "b" },
    ];

    const forward = buildLivingTreeProjection(input({ groups, chapters, memberships }));
    const reversed = buildLivingTreeProjection(
      input({
        groups: [...groups].reverse(),
        chapters: [...chapters].reverse(),
        memberships: [...memberships].reverse(),
      }),
    );

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed));
    expect(forward.overflowGroups.map((g) => g.id)).toEqual(["a", "b"]);
  });
});

describe("overflow ranking", () => {
  it("F-20 puts a group with an active chapter above one with only completed chapters", () => {
    const groups = [group("quiet", null, { createdAt: day(9) }), group("live", null, { createdAt: day(1) })];
    const chapters = [
      chapter("done", { status: "COMPLETE" }),
      chapter("current", { status: "ACTIVE" }),
    ];
    const memberships = [
      { goalId: "done", groupId: "quiet" },
      { goalId: "current", groupId: "live" },
    ];

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));
    expect(projection.overflowGroups.map((g) => g.id)).toEqual(["live", "quiet"]);
  });

  it("F-21 breaks a status tie on the most recent confirmed meaning", () => {
    const groups = [group("stale", null), group("fresh", null)];
    const chapters = [
      chapter("s", { latestConfirmed: { observationId: "a", text: "old", confirmedAt: day(2) } }),
      chapter("f", { latestConfirmed: { observationId: "b", text: "new", confirmedAt: day(20) } }),
    ];
    const memberships = [
      { goalId: "s", groupId: "stale" },
      { goalId: "f", groupId: "fresh" },
    ];

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));
    expect(projection.overflowGroups.map((g) => g.id)).toEqual(["fresh", "stale"]);
  });

  it("F-22 ranks a group with no confirmed meaning last", () => {
    const groups = [group("empty", null), group("confirmed", null)];
    const chapters = [
      chapter("e"),
      chapter("c", { latestConfirmed: { observationId: "x", text: "y", confirmedAt: day(3) } }),
    ];
    const memberships = [
      { goalId: "e", groupId: "empty" },
      { goalId: "c", groupId: "confirmed" },
    ];

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));
    expect(projection.overflowGroups.map((g) => g.id)).toEqual(["confirmed", "empty"]);
  });
});

describe("theme, category and relationship isolation", () => {
  it("F-15 groups only by confirmed membership, never by anything else", () => {
    // Two chapters that would share a theme or category in the underlying model
    // carry no such field here: the builder input cannot express it.
    const groups = [group("one", 1), group("two", 2)];
    const chapters = [chapter("a"), chapter("b")];
    const memberships = [
      { goalId: "a", groupId: "one" },
      { goalId: "b", groupId: "two" },
    ];

    const projection = buildLivingTreeProjection(input({ groups, chapters, memberships }));
    expect(projection.visibleGroups.map((g) => g.chapters.map((c) => c.goalId))).toEqual([
      ["a"],
      ["b"],
    ]);
  });
});

describe("buildFoundations", () => {
  it("F-06b rolls eight categories into four buckets", () => {
    const summary = buildFoundations([
      background("1", { backgroundCategory: "IDENTITY" }),
      background("2", { backgroundCategory: "PEOPLE" }),
      background("3", { backgroundCategory: "PLACES" }),
      background("4", { backgroundCategory: "WORK_QUALIFICATIONS" }),
      background("5", { backgroundCategory: "ASSETS_FINANCES" }),
      background("6", { backgroundCategory: "HEALTH" }),
      background("7", { backgroundCategory: "PREFERENCES_CONSTRAINTS" }),
      background("8", { backgroundCategory: "OTHER" }),
    ]);
    expect(summary).toEqual({ identity: 1, people: 1, places: 1, durableFacts: 5 });
  });

  it("F-08 counts the same canonical key twice under different categories", () => {
    const summary = buildFoundations([
      background("1", { backgroundCategory: "IDENTITY", canonicalKey: "manchester" }),
      background("2", { backgroundCategory: "PLACES", canonicalKey: "manchester" }),
    ]);
    expect(summary).toEqual({ identity: 1, people: 0, places: 1, durableFacts: 0 });
  });

  it("F-08b counts the same canonical key twice for different subjects", () => {
    const summary = buildFoundations([
      background("1", { backgroundCategory: "HEALTH", canonicalKey: "asthma", subjectType: "USER" }),
      background("2", {
        backgroundCategory: "HEALTH",
        canonicalKey: "asthma",
        subjectType: "OTHER_PERSON",
        subjectLabel: "Sam",
      }),
    ]);
    expect(summary.durableFacts).toBe(2);
  });

  it("F-08c collapses a genuine repeat of the same fact", () => {
    const summary = buildFoundations([
      background("1", { backgroundCategory: "PEOPLE", canonicalKey: "partner-sam" }),
      background("2", { backgroundCategory: "PEOPLE", canonicalKey: "partner-sam" }),
    ]);
    expect(summary.people).toBe(1);
  });

  it("F-08d keeps observations without a canonical key distinct", () => {
    const summary = buildFoundations([
      background("1", { backgroundCategory: "OTHER", canonicalKey: null }),
      background("2", { backgroundCategory: "OTHER", canonicalKey: null }),
    ]);
    expect(summary.durableFacts).toBe(2);
  });
});
