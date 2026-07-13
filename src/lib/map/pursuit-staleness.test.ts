import { describe, expect, it } from "vitest";

import {
  ACTIVE_STALE_AFTER_DAYS,
  MAINTAINING_STALE_AFTER_DAYS,
  buildThemeActivity,
  daysSinceDate,
  isStalePursuit,
  resolveLastTouchedAt,
  staleThresholdDays,
} from "@/lib/map/pursuit-staleness";

const NOW = Date.parse("2026-07-13T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW - days * 86_400_000);
}

describe("resolveLastTouchedAt", () => {
  it("returns goal updatedAt when there are no milestones", () => {
    const updatedAt = daysAgo(10);
    expect(resolveLastTouchedAt({ updatedAt })).toEqual(updatedAt);
  });

  it("returns the newest milestone completion when it beats the goal row", () => {
    const updatedAt = daysAgo(90);
    const milestoneTouch = daysAgo(3);
    expect(
      resolveLastTouchedAt({
        updatedAt,
        milestones: [
          { completedAt: daysAgo(40) },
          { completedAt: milestoneTouch },
          { completedAt: null },
        ],
      }),
    ).toEqual(milestoneTouch);
  });

  it("keeps the goal row when milestone completions are older", () => {
    const updatedAt = daysAgo(2);
    expect(
      resolveLastTouchedAt({ updatedAt, milestones: [{ completedAt: daysAgo(30) }] }),
    ).toEqual(updatedAt);
  });
});

describe("daysSinceDate", () => {
  it("floors to whole days", () => {
    expect(daysSinceDate(daysAgo(5), NOW)).toBe(5);
    expect(daysSinceDate(new Date(NOW - 5.9 * 86_400_000), NOW)).toBe(5);
  });

  it("clamps future dates to 0", () => {
    expect(daysSinceDate(new Date(NOW + 86_400_000), NOW)).toBe(0);
  });
});

describe("staleness thresholds", () => {
  it("ACTIVE goes stale at 60d, MAINTAINING at 120d", () => {
    expect(staleThresholdDays("ACTIVE")).toBe(ACTIVE_STALE_AFTER_DAYS);
    expect(staleThresholdDays("MAINTAINING")).toBe(MAINTAINING_STALE_AFTER_DAYS);
    expect(isStalePursuit("ACTIVE", 59)).toBe(false);
    expect(isStalePursuit("ACTIVE", 60)).toBe(true);
    expect(isStalePursuit("MAINTAINING", 60)).toBe(false);
    expect(isStalePursuit("MAINTAINING", 120)).toBe(true);
  });

  it("PAUSED and COMPLETE are never stale — they are intentional states", () => {
    expect(staleThresholdDays("PAUSED")).toBeNull();
    expect(staleThresholdDays("COMPLETE")).toBeNull();
    expect(isStalePursuit("PAUSED", 400)).toBe(false);
    expect(isStalePursuit("COMPLETE", 400)).toBe(false);
  });
});

describe("buildThemeActivity", () => {
  it("rolls up most recent touch, in-progress count, and stale count per theme", () => {
    const rows = buildThemeActivity(
      [
        { themeId: "health", status: "ACTIVE", lastTouchedAt: daysAgo(90) },
        { themeId: "health", status: "PAUSED", lastTouchedAt: daysAgo(5) },
        { themeId: "work", status: "ACTIVE", lastTouchedAt: daysAgo(1) },
        { themeId: "work", status: "MAINTAINING", lastTouchedAt: daysAgo(130) },
      ],
      NOW,
    );

    expect(rows).toEqual([
      {
        themeId: "health",
        lastTouchedAt: daysAgo(5).toISOString(),
        daysSinceTouched: 5,
        inProgressCount: 1,
        staleCount: 1,
      },
      {
        themeId: "work",
        lastTouchedAt: daysAgo(1).toISOString(),
        daysSinceTouched: 1,
        inProgressCount: 2,
        staleCount: 1,
      },
    ]);
  });

  it("returns empty for no goals", () => {
    expect(buildThemeActivity([], NOW)).toEqual([]);
  });
});
