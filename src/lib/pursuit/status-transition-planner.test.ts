import { describe, expect, it } from "vitest";

import {
  AUTHORING_WINDOW_HOURS,
  FLIP_COALESCE_HOURS,
  planStatusTransition,
  type LastTransition,
} from "@/lib/pursuit/status-transition-planner";

const NOW = Date.parse("2026-07-13T12:00:00.000Z");
const MS_PER_HOUR = 3_600_000;

function hoursAgo(hours: number): Date {
  return new Date(NOW - hours * MS_PER_HOUR);
}

function last(overrides: Partial<LastTransition> = {}): LastTransition {
  return {
    id: "t1",
    fromStatus: "ACTIVE",
    toStatus: "PAUSED",
    at: hoursAgo(1),
    ...overrides,
  };
}

describe("planStatusTransition", () => {
  it("skips no-op changes", () => {
    expect(
      planStatusTransition({
        from: "ACTIVE",
        to: "ACTIVE",
        goalCreatedAt: hoursAgo(100),
        last: null,
        now: NOW,
      }),
    ).toEqual({ action: "skip" });
  });

  it("treats changes inside the authoring window as birth corrections — no row", () => {
    // Backfill case: chapter created COMPLETE, user immediately flips it around.
    expect(
      planStatusTransition({
        from: "COMPLETE",
        to: "ACTIVE",
        goalCreatedAt: hoursAgo(AUTHORING_WINDOW_HOURS - 1),
        last: null,
        now: NOW,
      }),
    ).toEqual({ action: "skip" });
  });

  it("appends a lived transition after the authoring window", () => {
    expect(
      planStatusTransition({
        from: "ACTIVE",
        to: "PAUSED",
        goalCreatedAt: hoursAgo(AUTHORING_WINDOW_HOURS + 1),
        last: null,
        now: NOW,
      }),
    ).toEqual({ action: "append" });
  });

  it("nets A→B→A inside the flip window to nothing (deleteLast)", () => {
    expect(
      planStatusTransition({
        from: "PAUSED",
        to: "ACTIVE",
        goalCreatedAt: hoursAgo(1000),
        last: last({ fromStatus: "ACTIVE", toStatus: "PAUSED", at: hoursAgo(2) }),
        now: NOW,
      }),
    ).toEqual({ action: "deleteLast", lastId: "t1" });
  });

  it("collapses A→B→C inside the flip window to A→C", () => {
    expect(
      planStatusTransition({
        from: "PAUSED",
        to: "COMPLETE",
        goalCreatedAt: hoursAgo(1000),
        last: last({ fromStatus: "ACTIVE", toStatus: "PAUSED", at: hoursAgo(2) }),
        now: NOW,
      }),
    ).toEqual({ action: "collapseLast", lastId: "t1" });
  });

  it("appends once the flip window has passed — the pause was lived", () => {
    expect(
      planStatusTransition({
        from: "PAUSED",
        to: "ACTIVE",
        goalCreatedAt: hoursAgo(1000),
        last: last({ fromStatus: "ACTIVE", toStatus: "PAUSED", at: hoursAgo(FLIP_COALESCE_HOURS + 1) }),
        now: NOW,
      }),
    ).toEqual({ action: "append" });
  });

  it("appends instead of coalescing when history diverged from the goal row", () => {
    // last says the chapter ended PAUSED, but the observed change starts from
    // MAINTAINING — a missed hook or race; record what we saw.
    expect(
      planStatusTransition({
        from: "MAINTAINING",
        to: "ACTIVE",
        goalCreatedAt: hoursAgo(1000),
        last: last({ fromStatus: "ACTIVE", toStatus: "PAUSED", at: hoursAgo(2) }),
        now: NOW,
      }),
    ).toEqual({ action: "append" });
  });
});
