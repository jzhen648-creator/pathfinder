import { describe, expect, it } from "vitest";

import {
  compareDirtyPursuitPriority,
  sortDirtyPursuitPriorityRows,
  type DirtyPursuitPriorityRow,
} from "@/lib/map/reading-dirty-ledger";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";

const NOW = Date.parse("2026-06-19T12:00:00.000Z");

function row(
  id: string,
  overrides: Partial<DirtyPursuitPriorityRow> = {},
): DirtyPursuitPriorityRow {
  const signal: PursuitSignal = {
    title: "Pursuit",
    backgroundChars: 0,
    enrichAnswerCount: 0,
    milestoneCount: 0,
    completedMilestoneCount: 0,
    hasDeadline: false,
    hasQuantifiedTarget: false,
    status: "ACTIVE",
    ...(overrides.signal ?? {}),
  };

  return {
    id,
    significance: 3,
    signal,
    deadline: null,
    createdAt: new Date("2026-01-01"),
    status: "ACTIVE",
    completedAt: null,
    ...overrides,
  };
}

describe("compareDirtyPursuitPriority", () => {
  it("ranks higher significance first", () => {
    const high = row("high", { significance: 5 });
    const low = row("low", { significance: 2 });
    expect(compareDirtyPursuitPriority(high, low, NOW)).toBeLessThan(0);
  });

  it("ranks recently completed pursuits before active ones at equal significance", () => {
    const recentComplete = row("recent", {
      status: "COMPLETE",
      completedAt: new Date("2026-06-10"),
    });
    const active = row("active", { status: "ACTIVE" });
    expect(compareDirtyPursuitPriority(recentComplete, active, NOW)).toBeLessThan(0);
  });

  it("ranks recent completion before stale completion at equal significance", () => {
    const recentComplete = row("recent", {
      status: "COMPLETE",
      completedAt: new Date("2026-06-10"),
    });
    const staleComplete = row("stale", {
      status: "COMPLETE",
      completedAt: new Date("2025-01-01"),
    });
    expect(compareDirtyPursuitPriority(recentComplete, staleComplete, NOW)).toBeLessThan(0);
  });

  it("ranks thin pursuits before rich ones at equal significance", () => {
    const thin = row("thin", {
      signal: { title: "Hi", backgroundChars: 0, enrichAnswerCount: 0, milestoneCount: 0, completedMilestoneCount: 0, hasDeadline: false, hasQuantifiedTarget: false, status: "ACTIVE" },
    });
    const rich = row("rich", {
      signal: {
        title: "CeMAP exam",
        backgroundChars: 80,
        enrichAnswerCount: 0,
        milestoneCount: 0,
        completedMilestoneCount: 0,
        hasDeadline: true,
        hasQuantifiedTarget: false,
        status: "ACTIVE",
      },
    });
    expect(compareDirtyPursuitPriority(thin, rich, NOW)).toBeLessThan(0);
  });

  it("ranks sooner deadlines before later ones", () => {
    const soon = row("soon", {
      deadline: new Date("2026-07-01"),
    });
    const later = row("later", {
      deadline: new Date("2027-01-01"),
    });
    expect(compareDirtyPursuitPriority(soon, later, NOW)).toBeLessThan(0);
  });

  it("uses createdAt as a stable tiebreak", () => {
    const older = row("older", { createdAt: new Date("2026-01-01") });
    const newer = row("newer", { createdAt: new Date("2026-02-01") });
    expect(compareDirtyPursuitPriority(older, newer, NOW)).toBeLessThan(0);
  });
});

describe("sortDirtyPursuitPriorityRows", () => {
  it("orders by significance, recent completion, thinness, deadline, then age", () => {
    const sorted = sortDirtyPursuitPriorityRows(
      [
        row("old-low", {
          significance: 2,
          createdAt: new Date("2026-01-01"),
          deadline: new Date("2027-06-01"),
        }),
        row("wedding", {
          significance: 5,
          signal: {
            title: "Wedding",
            backgroundChars: 0,
            enrichAnswerCount: 0,
            milestoneCount: 0,
            completedMilestoneCount: 0,
            hasDeadline: true,
            hasQuantifiedTarget: false,
            status: "ACTIVE",
          },
          deadline: new Date("2026-09-01"),
        }),
        row("recent-complete", {
          significance: 4,
          status: "COMPLETE",
          completedAt: new Date("2026-06-01"),
          signal: {
            title: "CeMAP",
            backgroundChars: 80,
            enrichAnswerCount: 0,
            milestoneCount: 0,
            completedMilestoneCount: 0,
            hasDeadline: false,
            hasQuantifiedTarget: false,
            status: "COMPLETE",
          },
        }),
        row("rich-mid", {
          significance: 4,
          signal: {
            title: "Marathon",
            backgroundChars: 80,
            enrichAnswerCount: 0,
            milestoneCount: 0,
            completedMilestoneCount: 0,
            hasDeadline: true,
            hasQuantifiedTarget: false,
            status: "ACTIVE",
          },
          deadline: new Date("2026-08-01"),
        }),
      ],
      NOW,
    ).map((entry) => entry.id);

    expect(sorted).toEqual(["wedding", "recent-complete", "rich-mid", "old-low"]);
  });
});
