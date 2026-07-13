import { describe, expect, it } from "vitest";

import {
  buildSeasonSpineEvents,
  type SeasonPursuitMeta,
  type SeasonTransitionRow,
} from "@/lib/timeline/season-events";

const NOW = Date.parse("2026-07-13T12:00:00.000Z");
const MS_PER_DAY = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(NOW - days * MS_PER_DAY);
}

const META = new Map<string, SeasonPursuitMeta>([
  [
    "g1",
    {
      title: "London Marathon 2027",
      themeId: "health",
      themeLabel: "Health & Body",
      categoryLabel: "Fitness",
      significance: 3,
    },
  ],
]);

function row(
  goalId: string,
  fromStatus: string,
  toStatus: string,
  at: Date,
): SeasonTransitionRow {
  return { goalId, fromStatus, toStatus, at };
}

describe("buildSeasonSpineEvents", () => {
  it("emits a comeback with real pause duration when the pause was lived", () => {
    const events = buildSeasonSpineEvents(
      [
        row("g1", "ACTIVE", "PAUSED", daysAgo(100)),
        row("g1", "PAUSED", "ACTIVE", daysAgo(6)),
      ],
      META,
      NOW,
    );

    expect(events).toEqual([
      {
        kind: "pursuit_returned",
        date: daysAgo(6).toISOString().slice(0, 10),
        placement: "past",
        pausedDays: 94,
        title: "London Marathon 2027",
        themeId: "health",
        themeLabel: "Health & Body",
        categoryLabel: "Fitness",
        significance: 3,
      },
      {
        kind: "pursuit_paused",
        date: daysAgo(100).toISOString().slice(0, 10),
        placement: "past",
        title: "London Marathon 2027",
        themeId: "health",
        themeLabel: "Health & Body",
        categoryLabel: "Fitness",
        significance: 3,
      },
    ]);
  });

  it("suppresses short pauses and quick returns below the thresholds", () => {
    // Pause held 5d (<7) before returning — neither event should render.
    expect(
      buildSeasonSpineEvents(
        [
          row("g1", "ACTIVE", "PAUSED", daysAgo(5)),
          row("g1", "PAUSED", "ACTIVE", daysAgo(0)),
        ],
        META,
        NOW,
      ),
    ).toEqual([]);

    // Pause lived 10d (≥7 → pause shows) but return after 10d (<14 → no comeback).
    const events = buildSeasonSpineEvents(
      [
        row("g1", "ACTIVE", "PAUSED", daysAgo(10)),
        row("g1", "PAUSED", "ACTIVE", daysAgo(0)),
      ],
      META,
      NOW,
    );
    expect(events.map((e) => e.kind)).toEqual(["pursuit_paused"]);
  });

  it("shows an open-ended pause once it has been held long enough", () => {
    expect(
      buildSeasonSpineEvents([row("g1", "ACTIVE", "PAUSED", daysAgo(8))], META, NOW).map(
        (e) => e.kind,
      ),
    ).toEqual(["pursuit_paused"]);

    expect(
      buildSeasonSpineEvents([row("g1", "ACTIVE", "PAUSED", daysAgo(3))], META, NOW),
    ).toEqual([]);
  });

  it("skips goals without map-context meta (archived) and unordered input still pairs correctly", () => {
    const shuffled = [
      row("g1", "PAUSED", "ACTIVE", daysAgo(2)),
      row("ghost", "ACTIVE", "PAUSED", daysAgo(50)),
      row("g1", "ACTIVE", "PAUSED", daysAgo(30)),
    ];
    const events = buildSeasonSpineEvents(shuffled, META, NOW);
    expect(events.map((e) => [e.kind, e.title])).toEqual([
      ["pursuit_returned", "London Marathon 2027"],
      ["pursuit_paused", "London Marathon 2027"],
    ]);
    expect(events[0]?.pausedDays).toBe(28);
  });

  it("does not mint a comeback when the return does not follow a recorded pause", () => {
    expect(
      buildSeasonSpineEvents([row("g1", "PAUSED", "ACTIVE", daysAgo(2))], META, NOW),
    ).toEqual([]);
  });
});
