const MS_PER_DAY = 86_400_000;

/** ISO calendar date (YYYY-MM-DD) for the given instant — UTC, matches map_context deadlines. */
export function isoCalendarDate(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}

/** Whole days from `now` until a calendar deadline (positive = future, negative = overdue). */
export function daysUntilCalendarDate(deadlineYmd: string, now = Date.now()): number | null {
  const trimmed = deadlineYmd.trim().slice(0, 10);
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now) / MS_PER_DAY);
}
