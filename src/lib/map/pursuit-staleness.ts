/**
 * Pure staleness rules for pursuits and themes (no Prisma).
 *
 * "Touched" = the goal row's `updatedAt` or a milestone completion
 * (`Milestone` has no updatedAt column). Staleness only ever applies to
 * in-progress work: ACTIVE pursuits go quiet after 60 days, MAINTAINING
 * after 120 (deliberately low-touch). PAUSED and COMPLETE are intentional
 * states, never stale.
 *
 * Shared by GET /api/map-data (mobile render signal) and the reading
 * compiler (silence facts) so both surfaces agree on what "quiet" means.
 */

const MS_PER_DAY = 86_400_000;

export const ACTIVE_STALE_AFTER_DAYS = 60;
export const MAINTAINING_STALE_AFTER_DAYS = 120;

export type LastTouchedInput = {
  updatedAt: Date;
  milestones?: Array<{ completedAt?: Date | null }> | null;
};

/** Most recent write across the goal row and milestone completions. */
export function resolveLastTouchedAt(goal: LastTouchedInput): Date {
  let latest = goal.updatedAt;
  for (const milestone of goal.milestones ?? []) {
    if (milestone.completedAt && milestone.completedAt.getTime() > latest.getTime()) {
      latest = milestone.completedAt;
    }
  }
  return latest;
}

/** Whole days elapsed since `date`; clock skew clamps to 0, never negative. */
export function daysSinceDate(date: Date, now = Date.now()): number {
  return Math.max(0, Math.floor((now - date.getTime()) / MS_PER_DAY));
}

/** Days of silence after which this status counts as stale; null = never stale. */
export function staleThresholdDays(status: string): number | null {
  if (status === "ACTIVE") return ACTIVE_STALE_AFTER_DAYS;
  if (status === "MAINTAINING") return MAINTAINING_STALE_AFTER_DAYS;
  return null;
}

export function isStalePursuit(status: string, daysSinceTouched: number): boolean {
  const threshold = staleThresholdDays(status);
  return threshold != null && daysSinceTouched >= threshold;
}

export type ThemeActivityGoal = {
  themeId: string;
  status: string;
  lastTouchedAt: Date;
};

export type ThemeActivity = {
  themeId: string;
  /** ISO datetime of the most recent touch on any pursuit in the theme. */
  lastTouchedAt: string;
  daysSinceTouched: number;
  /** ACTIVE + MAINTAINING pursuits in the theme. */
  inProgressCount: number;
  /** In-progress pursuits past their staleness threshold. */
  staleCount: number;
};

/** Per-theme activity rollup from non-archived goals. Themes with no goals are absent. */
export function buildThemeActivity(
  goals: ThemeActivityGoal[],
  now = Date.now(),
): ThemeActivity[] {
  const byTheme = new Map<string, { lastTouchedAt: Date; inProgressCount: number; staleCount: number }>();

  for (const goal of goals) {
    const bucket = byTheme.get(goal.themeId) ?? {
      lastTouchedAt: goal.lastTouchedAt,
      inProgressCount: 0,
      staleCount: 0,
    };
    if (goal.lastTouchedAt.getTime() > bucket.lastTouchedAt.getTime()) {
      bucket.lastTouchedAt = goal.lastTouchedAt;
    }
    if (goal.status === "ACTIVE" || goal.status === "MAINTAINING") {
      bucket.inProgressCount += 1;
      if (isStalePursuit(goal.status, daysSinceDate(goal.lastTouchedAt, now))) {
        bucket.staleCount += 1;
      }
    }
    byTheme.set(goal.themeId, bucket);
  }

  return [...byTheme.entries()]
    .map(([themeId, bucket]) => ({
      themeId,
      lastTouchedAt: bucket.lastTouchedAt.toISOString(),
      daysSinceTouched: daysSinceDate(bucket.lastTouchedAt, now),
      inProgressCount: bucket.inProgressCount,
      staleCount: bucket.staleCount,
    }))
    .sort((a, b) => a.themeId.localeCompare(b.themeId));
}
