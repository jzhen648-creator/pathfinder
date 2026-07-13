import {
  COMEBACK_MIN_PAUSED_DAYS,
  SEASON_MIN_DAYS,
} from "@/lib/pursuit/status-transition-planner";
import type { SpineEvent } from "@/lib/timeline/spine-events";

/**
 * Seasons and comebacks from recorded status history (`PursuitStatusTransition`).
 *
 * Only *lived* arcs become events: a pause must have been held
 * SEASON_MIN_DAYS to appear at all, and a return only counts as a comeback
 * after COMEBACK_MIN_PAUSED_DAYS of pause. Rows below the bars stay
 * invisible — a pause is never framed as failure, and a comeback is part
 * of the story, not a streak reset.
 */

const MS_PER_DAY = 86_400_000;

export type SeasonTransitionRow = {
  goalId: string;
  fromStatus: string;
  toStatus: string;
  at: Date;
};

export type SeasonPursuitMeta = {
  title: string;
  themeId: string;
  themeLabel: string;
  categoryLabel?: string;
  significance?: number;
};

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function wholeDaysBetween(start: Date, end: Date | number): number {
  const endMs = typeof end === "number" ? end : end.getTime();
  return Math.floor((endMs - start.getTime()) / MS_PER_DAY);
}

/**
 * Derive pause/comeback spine events from status transitions.
 * Transitions may arrive in any order; goals without meta (archived,
 * filtered from the map context) are skipped.
 */
export function buildSeasonSpineEvents(
  transitions: SeasonTransitionRow[],
  pursuitMetaById: Map<string, SeasonPursuitMeta>,
  now = Date.now(),
): SpineEvent[] {
  const byGoal = new Map<string, SeasonTransitionRow[]>();
  for (const row of transitions) {
    const list = byGoal.get(row.goalId) ?? [];
    list.push(row);
    byGoal.set(row.goalId, list);
  }

  const events: SpineEvent[] = [];

  for (const [goalId, rows] of byGoal) {
    const meta = pursuitMetaById.get(goalId);
    if (!meta) continue;

    const ordered = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
    const base = {
      title: meta.title,
      themeId: meta.themeId,
      themeLabel: meta.themeLabel,
      ...(meta.categoryLabel ? { categoryLabel: meta.categoryLabel } : {}),
      ...(meta.significance != null ? { significance: meta.significance } : {}),
    };

    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i]!;

      if (row.toStatus === "PAUSED") {
        const pauseEnd = ordered[i + 1]?.at ?? now;
        if (wholeDaysBetween(row.at, pauseEnd) >= SEASON_MIN_DAYS) {
          events.push({
            kind: "pursuit_paused",
            date: toCalendarDate(row.at),
            placement: "past",
            ...base,
          });
        }
        continue;
      }

      if (
        row.fromStatus === "PAUSED" &&
        (row.toStatus === "ACTIVE" || row.toStatus === "MAINTAINING")
      ) {
        const previous = ordered[i - 1];
        if (!previous || previous.toStatus !== "PAUSED") continue;
        const pausedDays = wholeDaysBetween(previous.at, row.at);
        if (pausedDays >= COMEBACK_MIN_PAUSED_DAYS) {
          events.push({
            kind: "pursuit_returned",
            date: toCalendarDate(row.at),
            placement: "past",
            pausedDays,
            ...base,
          });
        }
      }
    }
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}
