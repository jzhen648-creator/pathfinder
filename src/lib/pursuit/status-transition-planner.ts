/**
 * Pure decision rules for recording pursuit status history (no Prisma).
 *
 * Principle: the map records what it witnessed, and the user edits what it
 * didn't. Lived transitions become `PursuitStatusTransition` rows; editorial
 * corrections never do:
 *
 * - Creation is a birth, not a transition — the initial status writes no row.
 * - Changes inside the authoring window after creation rewrite the birth
 *   status (backfilled chapters being "quickly updated") — no row.
 * - A→B→A inside the flip window nets to nothing; A→B→C collapses to A→C.
 * - Seasons/comebacks are render-side thresholds on top of stored rows —
 *   rows below the duration bars exist but stay invisible.
 */

const MS_PER_HOUR = 3_600_000;

/** Status changes this soon after chapter creation rewrite the birth status. */
export const AUTHORING_WINDOW_HOURS = 24;
/** Opposite/consecutive flips inside this window coalesce instead of stacking. */
export const FLIP_COALESCE_HOURS = 24;
/** Render-side: a season only draws when the status was held this long. */
export const SEASON_MIN_DAYS = 7;
/** Render-side: a comeback only celebrates when Paused was held this long. */
export const COMEBACK_MIN_PAUSED_DAYS = 14;

export type LastTransition = {
  id: string;
  fromStatus: string;
  toStatus: string;
  at: Date;
};

export type TransitionPlan =
  | { action: "skip" }
  | { action: "append" }
  /** New change undoes the last row inside the flip window — delete it, net zero. */
  | { action: "deleteLast"; lastId: string }
  /** New change extends the last row inside the flip window — rewrite its toStatus. */
  | { action: "collapseLast"; lastId: string };

export function planStatusTransition(input: {
  from: string;
  to: string;
  goalCreatedAt: Date;
  last: LastTransition | null;
  now?: number;
}): TransitionPlan {
  const { from, to, goalCreatedAt, last } = input;
  const now = input.now ?? Date.now();

  if (from === to) return { action: "skip" };

  if (now - goalCreatedAt.getTime() < AUTHORING_WINDOW_HOURS * MS_PER_HOUR) {
    return { action: "skip" };
  }

  if (last && now - last.at.getTime() < FLIP_COALESCE_HOURS * MS_PER_HOUR) {
    if (last.toStatus !== from) {
      // History diverged from the goal row (missed hook or race) — record the
      // observed change rather than coalescing against a stale row.
      return { action: "append" };
    }
    if (last.fromStatus === to) return { action: "deleteLast", lastId: last.id };
    return { action: "collapseLast", lastId: last.id };
  }

  return { action: "append" };
}
