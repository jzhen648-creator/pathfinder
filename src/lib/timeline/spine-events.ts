import type { FormattedMapContext, FormattedMapMark, FormattedMapPursuit } from "@/lib/ai/format-map-context";

export type SpineEventKind =
  | "mark"
  | "milestone_complete"
  | "pursuit_deadline"
  | "pursuit_complete"
  | "pursuit_abandoned";

export type SpineEvent = {
  kind: SpineEventKind;
  /** Calendar date YYYY-MM-DD */
  date: string;
  placement: "past" | "future";
  title: string;
  themeId: string;
  themeLabel: string;
  significance?: number;
  categoryLabel?: string;
  /** Parent pursuit title for milestone_complete rows. */
  pursuitTitle?: string;
};

export type SpineEventView = {
  past: SpineEvent[];
  future: SpineEvent[];
};

const MS_PER_DAY = 86_400_000;

function parseCalendarDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(`${value.trim().slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDayMs(now = Date.now()): number {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function placementForDate(date: Date, now = Date.now(), markFuture?: boolean | null): "past" | "future" {
  if (markFuture === true) return "future";
  if (markFuture === false) return "past";
  return date.getTime() >= startOfDayMs(now) ? "future" : "past";
}

/** Same completion-date rule as mobile Timeline (`build-timeline-spine.ts`). */
export function resolvePursuitCompleteDate(pursuit: FormattedMapPursuit): string | null {
  const milestoneDates = pursuit.milestones
    .map((m) => parseCalendarDate(m.completedAt))
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (milestoneDates[0]) return toCalendarDate(milestoneDates[0]);
  return pursuit.completedAt?.slice(0, 10) ?? null;
}

function flattenMarks(mapContext: FormattedMapContext): Array<FormattedMapMark & { themeId: string; themeLabel: string }> {
  const byId = new Map<string, FormattedMapMark & { themeId: string; themeLabel: string }>();
  for (const theme of mapContext.themes) {
    for (const mark of theme.marks) {
      byId.set(mark.id, { ...mark, themeId: theme.id, themeLabel: theme.label });
    }
    for (const hub of theme.hubs) {
      for (const mark of hub.marks) {
        byId.set(mark.id, { ...mark, themeId: theme.id, themeLabel: theme.label });
      }
    }
  }
  return [...byId.values()];
}

function flattenPursuits(
  mapContext: FormattedMapContext,
): Array<FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string }> {
  const rows: Array<
    FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string }
  > = [];
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        rows.push({
          ...pursuit,
          themeId: theme.id,
          themeLabel: theme.label,
          categoryLabel: hub.section || hub.label,
        });
      }
    }
  }
  return rows;
}

export function buildSpineEventsFromMapContext(
  mapContext: FormattedMapContext,
  options?: { now?: number; minSignificance?: number },
): SpineEventView {
  const now = options?.now ?? Date.now();
  const minSignificance = options?.minSignificance ?? 1;
  const todayStart = startOfDayMs(now);
  const events: SpineEvent[] = [];

  for (const mark of flattenMarks(mapContext)) {
    const date = parseCalendarDate(mark.date);
    if (!date) continue;
    events.push({
      kind: "mark",
      date: toCalendarDate(date),
      placement: placementForDate(date, now, mark.future),
      title: mark.title,
      themeId: mark.themeId,
      themeLabel: mark.themeLabel,
    });
  }

  for (const pursuit of flattenPursuits(mapContext)) {
    const significance = Math.min(5, Math.max(1, Math.round(pursuit.significance ?? 3)));
    const meta = {
      themeId: pursuit.themeId,
      themeLabel: pursuit.themeLabel,
      significance,
      categoryLabel: pursuit.categoryLabel,
    };

    if (pursuit.status === "ABANDONED") {
      const abandonedDate = parseCalendarDate(pursuit.completedAt);
      if (abandonedDate) {
        events.push({
          kind: "pursuit_abandoned",
          date: toCalendarDate(abandonedDate),
          placement: "past",
          title: pursuit.title,
          ...meta,
        });
      }
      continue;
    }

    if (pursuit.status !== "COMPLETE" && pursuit.deadline) {
      const deadline = parseCalendarDate(pursuit.deadline);
      if (deadline && deadline.getTime() >= todayStart) {
        events.push({
          kind: "pursuit_deadline",
          date: toCalendarDate(deadline),
          placement: "future",
          title: pursuit.title,
          ...meta,
        });
      }
    }

    if (pursuit.status === "COMPLETE") {
      const completeDate = resolvePursuitCompleteDate(pursuit);
      if (completeDate) {
        events.push({
          kind: "pursuit_complete",
          date: completeDate,
          placement: "past",
          title: pursuit.title,
          ...meta,
        });
      }
    }

    for (const milestone of pursuit.milestones) {
      if (!milestone.completed || !milestone.completedAt) continue;
      const completedDate = parseCalendarDate(milestone.completedAt);
      if (!completedDate) continue;
      events.push({
        kind: "milestone_complete",
        date: toCalendarDate(completedDate),
        placement: "past",
        title: milestone.title,
        pursuitTitle: pursuit.title,
        ...meta,
      });
    }
  }

  const filtered = events.filter((event) => {
    if (event.kind === "mark") return true;
    if (event.kind === "milestone_complete") {
      return (event.significance ?? 1) >= minSignificance;
    }
    return (event.significance ?? 1) >= minSignificance;
  });

  const past = filtered
    .filter((event) => event.placement === "past")
    .sort((a, b) => b.date.localeCompare(a.date));

  const future = filtered
    .filter((event) => event.placement === "future")
    .sort((a, b) => a.date.localeCompare(b.date));

  return { past, future };
}

export function capSpineEventsForPacket(
  view: SpineEventView,
  options?: { maxPast?: number; maxFuture?: number },
): SpineEventView {
  return {
    past: view.past.slice(0, options?.maxPast ?? 12),
    future: view.future.slice(0, options?.maxFuture ?? 8),
  };
}

export function countRecentCompletions(
  pursuits: FormattedMapPursuit[],
  options?: { windowDays?: number; now?: number },
): number {
  // 90d — map aggregate for thinPacketForMapDepth (starve arrival spine when count is 0).
  // Distinct from ARRIVAL_WINDOW_DAYS (120) in compile-reading-packet, which flags per-pursuit
  // "arrival" signals for the reading rubric; the aggregate uses a tighter window.
  const windowDays = options?.windowDays ?? 90;
  const now = options?.now ?? Date.now();
  const cutoff = now - windowDays * MS_PER_DAY;
  let count = 0;
  for (const pursuit of pursuits) {
    if (pursuit.status !== "COMPLETE") continue;
    const completeDate = resolvePursuitCompleteDate(pursuit);
    if (!completeDate) continue;
    const parsed = parseCalendarDate(completeDate);
    if (!parsed || parsed.getTime() < cutoff) continue;
    count += 1;
  }
  return count;
}
