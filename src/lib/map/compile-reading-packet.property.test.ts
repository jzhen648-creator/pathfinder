import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { FormattedMapPursuit } from "@/lib/ai/format-map-context";
import {
  buildGapFacts,
  computePursuitSignal,
  sortPursuitsTemporal,
  thinPacketForMapDepth,
  type ReadingPacket,
} from "@/lib/map/compile-reading-packet";
import { DENSE_FIXTURE_NOW } from "@/lib/map/__fixtures__/dense-map";

const FIXTURE_NOW = DENSE_FIXTURE_NOW;

const STATUS_SORT_RANK: Record<string, number> = {
  COMPLETE: 0,
  ACTIVE: 1,
  MAINTAINING: 1,
  PAUSED: 2,
};

function addDaysFromNow(days: number): string {
  return new Date(FIXTURE_NOW + days * 86_400_000).toISOString().slice(0, 10);
}

const pursuitArb: fc.Arbitrary<FormattedMapPursuit> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 40 }),
  status: fc.constantFrom("ACTIVE", "MAINTAINING", "COMPLETE", "PAUSED"),
  significance: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
  deadline: fc.option(
    fc.constantFrom(addDaysFromNow(5), addDaysFromNow(20), addDaysFromNow(45), addDaysFromNow(-3)),
    { nil: undefined },
  ),
  currentAmount: fc.option(fc.float({ min: Math.fround(0.01), max: 10_000, noNaN: true }), {
    nil: undefined,
  }),
  targetAmount: fc.option(fc.float({ min: Math.fround(0.01), max: 10_000, noNaN: true }), {
    nil: undefined,
  }),
  completedAt: fc.option(
    fc.constantFrom("2026-05-01", "2026-04-01", "2025-01-01", "2020-06-01"),
    { nil: undefined },
  ),
  milestones: fc.constant([]),
});

function countPacketFacts(packet: ReadingPacket): number {
  const categoryFacts = packet.categorySignals.reduce((sum, signal) => sum + signal.facts.length, 0);
  return (
    packet.changeEvents.length +
    categoryFacts +
    packet.gapFacts.length +
    packet.milestonePaceFacts.length +
    packet.recentEvents.past.length +
    packet.recentEvents.upcoming.length +
    (packet.confirmedRelationships?.length ?? 0)
  );
}

const readingPacketArb: fc.Arbitrary<ReadingPacket> = fc.record({
  changeEvents: fc.array(fc.string({ minLength: 0, maxLength: 80 }), { maxLength: 8 }),
  categorySignals: fc.array(
    fc.record({
      themeLabel: fc.string({ minLength: 1, maxLength: 20 }),
      categoryLabel: fc.string({ minLength: 1, maxLength: 20 }),
      byStatus: fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.nat({ max: 5 })),
      pursuits: fc.array(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 30 }),
          status: fc.constantFrom("ACTIVE", "COMPLETE", "MAINTAINING"),
        }),
        { maxLength: 6 },
      ),
      facts: fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 6 }),
    }),
    { maxLength: 4 },
  ),
  mapAggregates: fc.record({
    totalPursuits: fc.nat({ max: 20 }),
    upcomingDeadlines14d: fc.nat({ max: 10 }),
    upcomingDeadlines30d: fc.nat({ max: 10 }),
    recentCompletions90d: fc.nat({ max: 10 }),
    highSignificanceActive: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 6 }),
  }),
  recentEvents: fc.record({
    past: fc.array(
      fc.record({
        kind: fc.constantFrom("pursuit_complete", "milestone_complete", "mark"),
        date: fc.constant("2026-05-01"),
        placement: fc.constant("past" as const),
        title: fc.string({ minLength: 1, maxLength: 40 }),
        themeId: fc.constant("work"),
        themeLabel: fc.constant("Work & Career"),
      }),
      { maxLength: 6 },
    ),
    upcoming: fc.array(
      fc.record({
        kind: fc.constantFrom("pursuit_deadline", "mark"),
        date: fc.constant("2026-07-01"),
        placement: fc.constant("future" as const),
        title: fc.string({ minLength: 1, maxLength: 40 }),
        themeId: fc.constant("work"),
        themeLabel: fc.constant("Work & Career"),
      }),
      { maxLength: 6 },
    ),
  }),
  gapFacts: fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 6 }),
  milestonePaceFacts: fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 8 }),
});

describe("compile-reading-packet discovery properties", () => {
  it("P3: quantified pursuits with currentAmount > 0 never get a gap signal", () => {
    fc.assert(
      fc.property(pursuitArb, (pursuit) => {
        fc.pre(
          (pursuit.status === "ACTIVE" || pursuit.status === "MAINTAINING") &&
            (pursuit.significance ?? 0) >= 4 &&
            Boolean(pursuit.deadline?.trim()) &&
            (pursuit.targetAmount ?? 0) > 0 &&
            (pursuit.currentAmount ?? 0) > 0,
        );

        expect(computePursuitSignal(pursuit, FIXTURE_NOW)).not.toBe("gap");
        expect(buildGapFacts([pursuit], FIXTURE_NOW)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("P4: thinPacketForMapDepth never adds facts", () => {
    fc.assert(
      fc.property(readingPacketArb, (packet) => {
        const thinned = thinPacketForMapDepth(packet);
        expect(countPacketFacts(thinned)).toBeLessThanOrEqual(countPacketFacts(packet));
        expect(thinned.gapFacts).toEqual(packet.gapFacts);
        expect(thinned.milestonePaceFacts).toEqual(packet.milestonePaceFacts);
        expect(thinned.changeEvents).toEqual(packet.changeEvents);
        expect(thinned.recentEvents.upcoming).toEqual(packet.recentEvents.upcoming);
        expect(thinned.recentEvents.past.length).toBeLessThanOrEqual(packet.recentEvents.past.length);
      }),
      { numRuns: 200 },
    );
  });

  it("P5: sortPursuitsTemporal is a stable total order", () => {
    fc.assert(
      fc.property(fc.array(pursuitArb, { maxLength: 30 }), (rawPursuits) => {
        const pursuits = rawPursuits.map((pursuit, index) => ({
          ...pursuit,
          id: `${pursuit.id}-${index}`,
        }));
        const once = sortPursuitsTemporal(pursuits, FIXTURE_NOW);
        const twice = sortPursuitsTemporal(once, FIXTURE_NOW);

        expect(once).toHaveLength(pursuits.length);
        expect(twice.map((p) => p.id)).toEqual(once.map((p) => p.id));
        expect(new Set(once.map((p) => p.id)).size).toBe(pursuits.length);

        for (let i = 1; i < once.length; i += 1) {
          const left = once[i - 1]!;
          const right = once[i]!;
          const rankLeft = STATUS_SORT_RANK[left.status] ?? 99;
          const rankRight = STATUS_SORT_RANK[right.status] ?? 99;
          expect(rankLeft).toBeLessThanOrEqual(rankRight);
        }
      }),
      { numRuns: 200 },
    );
  });
});
