import { formatMapContext, type FormattedMapContext, type FormattedMapPursuit } from "@/lib/ai/format-map-context";
import { getLifeArea } from "@/lib/life-areas";
import {
  listReadingDirtyRows,
  type ReadingDirtyAnalysis,
  type ReadingDirtyRow,
} from "@/lib/map/reading-dirty-ledger";
import {
  buildSpineEventsFromMapContext,
  capSpineEventsForPacket,
  type SpineEvent,
} from "@/lib/timeline/spine-events";
import { prisma } from "@/lib/prisma";

export type PursuitReadingSignal = "gap" | "arrival";

export type ReadingPacketPursuit = {
  title: string;
  status: string;
  deadline?: string;
  significance?: number;
  currentAmount?: number;
  targetAmount?: number;
  unit?: string;
  /** Derived from this pursuit's own attributes — not cross-pursuit succession. */
  signal?: PursuitReadingSignal;
};

export type ReadingPacketCategorySignal = {
  themeLabel: string;
  categoryLabel: string;
  byStatus: Record<string, number>;
  pursuits: ReadingPacketPursuit[];
  facts: string[];
};

/** User-confirmed lateral pursuit link — compact mirror of map_context.confirmedRelationships. */
export type ReadingPacketConfirmedRelationship = {
  goalAId: string;
  goalBId: string;
  goalATitle: string;
  goalBTitle: string;
  label?: string | null;
};

export type ReadingPacket = {
  changeEvents: string[];
  /** User-authored pursuit connections — omitted when the map has none. */
  confirmedRelationships?: ReadingPacketConfirmedRelationship[];
  categorySignals: ReadingPacketCategorySignal[];
  /** Chronological spine — filtered for Reading (goal.completedAt arrival gate; no milestone_complete). */
  recentEvents: {
    past: SpineEvent[];
    upcoming: SpineEvent[];
  };
  mapAggregates: {
    totalPursuits: number;
    upcomingDeadlines14d: number;
    upcomingDeadlines30d: number;
    /** Completions within the last 90 days (not all-time complete count). */
    recentCompletions90d: number;
    highSignificanceActive: string[];
  };
  /** Factual lines for pursuits flagged gap — explicit Gap-lens grounding. */
  gapFacts: string[];
  /** Deterministic milestone progress lines for AI grounding. */
  milestonePaceFacts: string[];
};

const MS_PER_DAY = 86_400_000;

export const GAP_MIN_SIGNIFICANCE = 4;
export const GAP_DEADLINE_DAYS = 30;
// 120d — per-pursuit "arrival" signal for the reading rubric (recently completed arc).
// Distinct from countReadingPacketRecentCompletions (90d), which drives mapAggregates and thinPacketForMapDepth.
export const ARRIVAL_WINDOW_DAYS = 120;

const STATUS_SORT_RANK: Record<string, number> = {
  COMPLETE: 0,
  ACTIVE: 1,
  MAINTAINING: 1,
  PAUSED: 2,
};

function formatDeadlineLabel(deadline?: string): string | null {
  if (!deadline) return null;
  const date = new Date(`${deadline}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function daysUntil(deadline: string, now = Date.now()): number | null {
  const date = new Date(`${deadline}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now) / MS_PER_DAY);
}

export function countCompletedMilestones(pursuit: FormattedMapPursuit): number {
  return (pursuit.milestones ?? []).filter((m) => m.completed && m.completedAt).length;
}

/** Reading-packet recency only — goal.completedAt; Timeline uses resolvePursuitCompleteDate in spine-events. */
export function resolveReadingPacketCompleteDate(pursuit: FormattedMapPursuit): string | null {
  const raw = pursuit.completedAt?.trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

export function resolvePursuitCompletedAt(pursuit: FormattedMapPursuit): string | null {
  return resolveReadingPacketCompleteDate(pursuit);
}

export function computePursuitSignal(
  pursuit: FormattedMapPursuit,
  now = Date.now(),
): PursuitReadingSignal | null {
  if (pursuit.status === "COMPLETE") {
    const completedAt = resolvePursuitCompletedAt(pursuit);
    if (!completedAt) return null;
    const parsed = parseCalendarDate(completedAt);
    if (!parsed) return null;
    const daysAgo = Math.round((now - parsed.getTime()) / MS_PER_DAY);
    if (daysAgo >= 0 && daysAgo <= ARRIVAL_WINDOW_DAYS) return "arrival";
    return null;
  }

  if (pursuit.status !== "ACTIVE" && pursuit.status !== "MAINTAINING") return null;
  if (pursuit.significance == null || pursuit.significance < GAP_MIN_SIGNIFICANCE) return null;
  if (!pursuit.deadline) return null;

  const until = daysUntil(pursuit.deadline, now);
  if (until == null || until < 0 || until > GAP_DEADLINE_DAYS) return null;

  const milestones = pursuit.milestones ?? [];
  if (milestones.length > 0 && countCompletedMilestones(pursuit) > 0) return null;

  // Amount-based pursuits: currentAmount toward targetAmount is movement — not milestone-based stall.
  if ((pursuit.targetAmount ?? 0) > 0 && (pursuit.currentAmount ?? 0) > 0) return null;

  return "gap";
}

export function formatGapFactLine(pursuit: FormattedMapPursuit, now = Date.now()): string {
  const until = pursuit.deadline ? daysUntil(pursuit.deadline, now) : null;
  const deadlinePart = until != null ? `deadline ${until}d` : "deadline unknown";
  const milestones = pursuit.milestones ?? [];
  const milestonePart =
    milestones.length === 0
      ? "no milestones defined"
      : `0 of ${milestones.length} milestones completed`;
  const sigPart =
    pursuit.significance != null ? `sig ${pursuit.significance}, ` : "";
  return `${pursuit.title} (${sigPart}${deadlinePart}, ${milestonePart})`;
}

export function sortPursuitsTemporal<T extends FormattedMapPursuit>(
  pursuits: T[],
  now = Date.now(),
): T[] {
  return [...pursuits].sort((a, b) => {
    const rankA = STATUS_SORT_RANK[a.status] ?? 3;
    const rankB = STATUS_SORT_RANK[b.status] ?? 3;
    if (rankA !== rankB) return rankA - rankB;

    if (a.status === "COMPLETE" && b.status === "COMPLETE") {
      const dateA = parseCalendarDate(resolvePursuitCompletedAt(a) ?? undefined)?.getTime() ?? 0;
      const dateB = parseCalendarDate(resolvePursuitCompletedAt(b) ?? undefined)?.getTime() ?? 0;
      return dateA - dateB;
    }

    if (
      (a.status === "ACTIVE" || a.status === "MAINTAINING") &&
      (b.status === "ACTIVE" || b.status === "MAINTAINING")
    ) {
      const daysA = a.deadline ? daysUntil(a.deadline, now) : null;
      const daysB = b.deadline ? daysUntil(b.deadline, now) : null;
      const sortA = daysA ?? Number.POSITIVE_INFINITY;
      const sortB = daysB ?? Number.POSITIVE_INFINITY;
      return sortA - sortB;
    }

    return 0;
  });
}

export function buildGapFacts(
  pursuits: FormattedMapPursuit[],
  now = Date.now(),
): string[] {
  const facts: string[] = [];
  for (const pursuit of pursuits) {
    if (computePursuitSignal(pursuit, now) !== "gap") continue;
    facts.push(`Significant but stalled: ${formatGapFactLine(pursuit, now)}`);
  }
  return facts.slice(0, 6);
}

function flattenPursuits(mapContext: FormattedMapContext): Array<
  FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string; categoryId: string }
> {
  const rows: Array<
    FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string; categoryId: string }
  > = [];
  for (const theme of mapContext.themes) {
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        rows.push({
          ...pursuit,
          themeId: theme.id,
          themeLabel: theme.label,
          categoryLabel: category.categoryLabel || category.label,
          categoryId: category.id,
        });
      }
    }
  }
  return rows;
}

function formatFieldChange(label: string, change: { field: string; from?: string | number | null; to?: string | number | null }): string {
  return `${label}: ${change.field} ${change.from ?? "null"} → ${change.to ?? "null"}`;
}

export function buildChangeEventsFromDirtyRows(rows: ReadingDirtyRow[]): string[] {
  const events: string[] = [];
  for (const row of rows) {
    const details = row.details;
    if (!details) {
      if (row.reason === "pursuit_updated") continue;
      events.push(row.reason.replaceAll("_", " "));
      continue;
    }

    const label = details.title?.trim() || row.entityId;

    if (details.event === "created") {
      events.push(`Chapter added: "${label}"`);
      continue;
    }
    if (details.event === "archived") {
      continue;
    }
    if (details.event === "restored") {
      events.push(`Chapter restored: "${label}"`);
      continue;
    }
    if (row.entityType === "mark") {
      if (details.event === "created") {
        events.push(`Mark added: "${label}"`);
      } else if (details.event === "archived") {
        events.push(`Mark archived: "${label}"`);
      } else if (details.event === "updated") {
        events.push(`Mark updated: "${label}"`);
      }
      continue;
    }

    if (details.milestoneTitle) {
      const completedChange = details.changes?.find((c) => c.field === "milestoneCompleted");
      if (completedChange?.to === "true") {
        events.push(`"${label}": milestone "${details.milestoneTitle}" completed`);
      } else {
        events.push(`"${label}": milestone "${details.milestoneTitle}" updated`);
      }
      continue;
    }

    for (const change of details.changes ?? []) {
      events.push(formatFieldChange(`"${label}"`, change));
    }
  }
  return [...new Set(events)];
}

export function buildCategorySignals(
  pursuits: ReturnType<typeof flattenPursuits>,
  focusCategoryIds: Set<string>,
  now = Date.now(),
): ReadingPacketCategorySignal[] {
  const byCategory = new Map<string, ReturnType<typeof flattenPursuits>>();

  for (const pursuit of pursuits) {
    if (!focusCategoryIds.has(pursuit.categoryId)) continue;
    const list = byCategory.get(pursuit.categoryId) ?? [];
    list.push(pursuit);
    byCategory.set(pursuit.categoryId, list);
  }

  const signals: ReadingPacketCategorySignal[] = [];

  for (const [, categoryPursuits] of byCategory) {
    if (categoryPursuits.length === 0) continue;
    const sample = categoryPursuits[0];
    const byStatus: Record<string, number> = {};
    for (const pursuit of categoryPursuits) {
      byStatus[pursuit.status] = (byStatus[pursuit.status] ?? 0) + 1;
    }

    const facts: string[] = [];
    const completeCount = byStatus.COMPLETE ?? 0;
    const activeCount = (byStatus.ACTIVE ?? 0) + (byStatus.MAINTAINING ?? 0);
    const activeWithDeadline = categoryPursuits.filter(
      (p) => (p.status === "ACTIVE" || p.status === "MAINTAINING") && p.deadline,
    );

    if (completeCount > 0 && activeCount > 0) {
      facts.push(
        `${sample.themeLabel} · ${sample.categoryLabel}: ${completeCount} complete and ${activeCount} in progress`,
      );
    } else if (completeCount > 0) {
      facts.push(`${sample.themeLabel} · ${sample.categoryLabel}: ${completeCount} complete`);
    } else if (activeCount > 0) {
      facts.push(`${sample.themeLabel} · ${sample.categoryLabel}: ${activeCount} in progress`);
    }

    if (activeWithDeadline.length > 0) {
      const labels = activeWithDeadline
        .map((p) => {
          const dl = formatDeadlineLabel(p.deadline);
          return dl ? `${p.title} (deadline ${dl})` : p.title;
        })
        .slice(0, 3);
      facts.push(`Active with deadlines: ${labels.join("; ")}`);
    }

    const ordered = sortPursuitsTemporal(categoryPursuits, now);
    let categoryGapFacts = 0;
    for (const pursuit of ordered) {
      if (computePursuitSignal(pursuit, now) !== "gap") continue;
      facts.push(`Significant but stalled: ${formatGapFactLine(pursuit, now)}`);
      categoryGapFacts += 1;
      if (categoryGapFacts >= 3) break;
    }

    signals.push({
      themeLabel: sample.themeLabel,
      categoryLabel: sample.categoryLabel,
      byStatus,
      pursuits: ordered.map((p) => {
        const row: ReadingPacketPursuit = {
          title: p.title,
          status: p.status,
        };
        if (p.deadline) row.deadline = p.deadline;
        if (p.significance != null) row.significance = p.significance;
        if (p.currentAmount != null) row.currentAmount = p.currentAmount;
        if (p.targetAmount != null) row.targetAmount = p.targetAmount;
        if (p.unit?.trim()) row.unit = p.unit.trim();
        const signal = computePursuitSignal(p, now);
        if (signal) row.signal = signal;
        return row;
      }),
      facts,
    });
  }

  return signals.sort((a, b) =>
    `${a.themeLabel}:${a.categoryLabel}`.localeCompare(`${b.themeLabel}:${b.categoryLabel}`),
  );
}

const HIGH_SIGNIFICANCE_ACTIVE_CAP = 6;

type FlatPursuit = ReturnType<typeof flattenPursuits>[number];

function isHighSignificanceEligible(pursuit: FlatPursuit): boolean {
  return (
    (pursuit.status === "ACTIVE" || pursuit.status === "MAINTAINING") &&
    pursuit.significance != null &&
    pursuit.significance >= GAP_MIN_SIGNIFICANCE
  );
}

function comparePursuitsBySignificanceDesc(a: FlatPursuit, b: FlatPursuit): number {
  const sigA = a.significance ?? 0;
  const sigB = b.significance ?? 0;
  if (sigB !== sigA) return sigB - sigA;
  return a.title.localeCompare(b.title);
}

/** PANORAMIC: one heaviest active pursuit per theme, then overflow by significance. SPARSE: flat sort. */
export function buildHighSignificanceActiveTitles(
  pursuits: ReturnType<typeof flattenPursuits>,
): string[] {
  const eligible = pursuits.filter(isHighSignificanceEligible);

  if (pursuits.length <= 2) {
    return [...eligible]
      .sort(comparePursuitsBySignificanceDesc)
      .map((p) => p.title)
      .slice(0, HIGH_SIGNIFICANCE_ACTIVE_CAP);
  }

  const byTheme = new Map<string, FlatPursuit>();
  for (const pursuit of eligible) {
    const existing = byTheme.get(pursuit.themeId);
    if (!existing || comparePursuitsBySignificanceDesc(pursuit, existing) < 0) {
      byTheme.set(pursuit.themeId, pursuit);
    }
  }

  const result = [...byTheme.values()]
    .sort(comparePursuitsBySignificanceDesc)
    .map((p) => p.title);
  const seen = new Set(result);

  if (result.length < HIGH_SIGNIFICANCE_ACTIVE_CAP) {
    for (const pursuit of [...eligible]
      .filter((p) => !seen.has(p.title))
      .sort(comparePursuitsBySignificanceDesc)) {
      if (result.length >= HIGH_SIGNIFICANCE_ACTIVE_CAP) break;
      result.push(pursuit.title);
      seen.add(pursuit.title);
    }
  }

  return result.slice(0, HIGH_SIGNIFICANCE_ACTIVE_CAP);
}

export function buildMapAggregates(
  pursuits: ReturnType<typeof flattenPursuits>,
  now = Date.now(),
): ReadingPacket["mapAggregates"] {
  let upcomingDeadlines14d = 0;
  let upcomingDeadlines30d = 0;

  for (const pursuit of pursuits) {
    if (!pursuit.deadline) continue;
    if (pursuit.status === "COMPLETE" || pursuit.status === "PAUSED") {
      continue;
    }
    const days = daysUntil(pursuit.deadline, now);
    if (days == null || days < 0) continue;
    if (days <= 14) upcomingDeadlines14d += 1;
    if (days <= 30) upcomingDeadlines30d += 1;
  }

  return {
    totalPursuits: pursuits.length,
    upcomingDeadlines14d,
    upcomingDeadlines30d,
    recentCompletions90d: countReadingPacketRecentCompletions(pursuits, now),
    highSignificanceActive: buildHighSignificanceActiveTitles(pursuits),
  };
}

/** Copy confirmedRelationships from map_context — omitted when empty. */
export function packConfirmedRelationships(
  mapContext: FormattedMapContext,
): ReadingPacketConfirmedRelationship[] | undefined {
  const rows = mapContext.confirmedRelationships;
  if (!rows?.length) return undefined;
  return rows;
}

/**
 * Map context for prompts that also send reading_packet.
 * Relationships are authoritative in the packet — omit from map_context to avoid double-send.
 */
export function mapContextForReadingPacketPrompt(
  mapContext: FormattedMapContext,
): Omit<FormattedMapContext, "confirmedRelationships"> {
  const { confirmedRelationships: _omitted, ...rest } = mapContext;
  return rest;
}

/** Stable key order for Gemini — mapAggregates before recentEvents. */
export function orderReadingPacketKeys(packet: ReadingPacket): ReadingPacket {
  if (packet.confirmedRelationships?.length) {
    return {
      changeEvents: packet.changeEvents,
      confirmedRelationships: packet.confirmedRelationships,
      categorySignals: packet.categorySignals,
      mapAggregates: packet.mapAggregates,
      recentEvents: packet.recentEvents,
      gapFacts: packet.gapFacts,
      milestonePaceFacts: packet.milestonePaceFacts,
    };
  }
  return {
    changeEvents: packet.changeEvents,
    categorySignals: packet.categorySignals,
    mapAggregates: packet.mapAggregates,
    recentEvents: packet.recentEvents,
    gapFacts: packet.gapFacts,
    milestonePaceFacts: packet.milestonePaceFacts,
  };
}

export function buildMilestonePaceFacts(
  pursuits: FormattedMapPursuit[],
  now = Date.now(),
): string[] {
  const facts: string[] = [];
  for (const pursuit of pursuits) {
    const milestones = pursuit.milestones ?? [];
    if (milestones.length === 0) continue;
    const completed = milestones.filter((m) => m.completed && m.completedAt);

    if (completed.length === 0) {
      const startYmd = pursuit.timelineStart ?? pursuit.addedToMap;
      const startDate = parseCalendarDate(startYmd);
      if (!startDate) continue;
      const elapsed = formatElapsedSince(startDate, now);
      const spanLabel = pursuit.timelineStart ? `started ${elapsed}` : `added to map ${elapsed}`;
      let line = `${pursuit.title}: ${spanLabel}`;
      if (pursuit.deadline) {
        const until = daysUntil(pursuit.deadline, now);
        if (until != null) line += `; deadline in ${until}d`;
      }
      line += `; 0 of ${milestones.length} milestones completed`;
      facts.push(line);
      continue;
    }

    const dates = completed
      .map((m) => parseCalendarDate(m.completedAt))
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());

    let line = `${pursuit.title}: ${completed.length}/${milestones.length} milestones complete`;
    if (dates.length >= 2) {
      const spanDays = Math.max(
        1,
        Math.round((dates[dates.length - 1]!.getTime() - dates[0]!.getTime()) / MS_PER_DAY),
      );
      line += `; completions over ~${spanDays}d`;
    } else if (dates[0]) {
      const daysAgo = Math.max(
        0,
        Math.round((now - dates[0].getTime()) / MS_PER_DAY),
      );
      line += `; last milestone ${daysAgo}d ago`;
    }
    facts.push(line);
  }
  return facts.slice(0, 8);
}

/** Starve rubric facts the map cannot support — conditionality lives in the packet, not the prompt. */
export function thinPacketForMapDepth(packet: ReadingPacket): ReadingPacket {
  let recentEvents = packet.recentEvents;

  if (packet.mapAggregates.recentCompletions90d === 0) {
    recentEvents = {
      ...packet.recentEvents,
      past: packet.recentEvents.past.filter((e) => e.kind !== "pursuit_complete"),
    };
  }

  return {
    ...packet,
    recentEvents,
  };
}

function parseCalendarDate(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(`${value.trim().slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Age in whole years at a calendar date (YYYY-MM-DD), UTC midnight. */
export function ageAtCalendarDate(dateOfBirth: Date, calendarYmd: string): number | null {
  const at = parseCalendarDate(calendarYmd);
  if (!at) return null;
  let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function daysSinceCalendarDate(calendarDate: string, now: number): number | null {
  const parsed = parseCalendarDate(calendarDate);
  if (!parsed) return null;
  return Math.round((now - parsed.getTime()) / MS_PER_DAY);
}

function isWithinReadingArrivalWindow(completedAt: string, now: number): boolean {
  const daysAgo = daysSinceCalendarDate(completedAt, now);
  return daysAgo != null && daysAgo >= 0 && daysAgo <= ARRIVAL_WINDOW_DAYS;
}

function countReadingPacketRecentCompletions(pursuits: FormattedMapPursuit[], now: number): number {
  let count = 0;
  for (const pursuit of pursuits) {
    if (pursuit.status !== "COMPLETE") continue;
    const completedAt = resolveReadingPacketCompleteDate(pursuit);
    if (!completedAt) continue;
    const daysAgo = daysSinceCalendarDate(completedAt, now);
    if (daysAgo == null || daysAgo < 0 || daysAgo > 90) continue;
    count += 1;
  }
  return count;
}

/** Reading spine — filtered from Timeline spine; no milestone_complete; pursuit_complete gated by goal.completedAt. */
export function buildReadingPacketRecentEvents(
  mapContext: FormattedMapContext,
  now: number,
): ReadingPacket["recentEvents"] {
  const spine = capSpineEventsForPacket(buildSpineEventsFromMapContext(mapContext, { now }));
  const recentCompleteTitles = new Set(
    flattenPursuits(mapContext)
      .filter((p) => {
        if (p.status !== "COMPLETE") return false;
        const completedAt = resolveReadingPacketCompleteDate(p);
        if (!completedAt) return false;
        return isWithinReadingArrivalWindow(completedAt, now);
      })
      .map((p) => p.title),
  );

  return {
    past: spine.past.filter((event) => {
      if (event.kind === "milestone_complete") return false;
      if (event.kind === "pursuit_complete") return recentCompleteTitles.has(event.title);
      return true;
    }),
    upcoming: spine.future,
  };
}

function formatElapsedSince(startDate: Date, now: number): string {
  const days = Math.max(0, Math.round((now - startDate.getTime()) / MS_PER_DAY));
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function resolveFocusCategoryIds(
  userId: string,
  dirty: ReadingDirtyAnalysis,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const pursuitIds = [...new Set([...dirty.activeDirtyPursuitIds, ...dirty.pursuitIds])];
  if (pursuitIds.length === 0) return ids;

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: { categoryId: true },
  });
  for (const goal of goals) {
    if (goal.categoryId) ids.add(goal.categoryId);
  }
  return ids;
}

export type CompileReadingPacketOptions = {
  /** Preloaded map — skips formatMapContext when reflect sync already loaded it. */
  mapContext?: FormattedMapContext;
};

export async function compileReadingPacket(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  opts?: CompileReadingPacketOptions,
): Promise<ReadingPacket> {
  const now = Date.now();
  const [mapContext, dirtyRows, focusCategoryIds] = await Promise.all([
    opts?.mapContext ? Promise.resolve(opts.mapContext) : formatMapContext(userId),
    listReadingDirtyRows(userId),
    resolveFocusCategoryIds(userId, dirty),
  ]);

  const pursuits = flattenPursuits(mapContext);
  const changeEvents = buildChangeEventsFromDirtyRows(
    dirtyRows.filter((row) => row.entityType === "pursuit"),
  );

  const confirmedRelationships = packConfirmedRelationships(mapContext);

  const packet: ReadingPacket = {
    changeEvents,
    categorySignals: buildCategorySignals(pursuits, focusCategoryIds, now),
    mapAggregates: buildMapAggregates(pursuits, now),
    recentEvents: buildReadingPacketRecentEvents(mapContext, now),
    gapFacts: buildGapFacts(pursuits, now),
    milestonePaceFacts: buildMilestonePaceFacts(pursuits, now),
    ...(confirmedRelationships ? { confirmedRelationships } : {}),
  };

  return thinPacketForMapDepth(packet);
}

export function readingPacketToJson(packet: ReadingPacket): string {
  return JSON.stringify(orderReadingPacketKeys(packet));
}

/** Theme label helper for tests. */
export function themeLabelForId(themeId: string): string {
  return getLifeArea(themeId)?.label ?? themeId;
}

/** Deterministic chapter arc facts for pursuit panel prompts — no enrichAnswers. */
export function buildFocalPursuitReadingFacts(
  pursuit: FormattedMapPursuit,
  now = Date.now(),
  dateOfBirth: Date | null = null,
): string[] {
  const facts: string[] = [`Status: ${pursuit.status}`];

  if (pursuit.significance != null) {
    facts.push(`Significance: ${pursuit.significance}/5`);
  }
  if (pursuit.timelineStart) {
    facts.push(`Timeline started: ${pursuit.timelineStart}`);
    if (dateOfBirth) {
      const ageAtStart = ageAtCalendarDate(dateOfBirth, pursuit.timelineStart);
      if (ageAtStart != null) facts.push(`Age at start: ${ageAtStart}`);
    }
  } else if (pursuit.addedToMap) {
    facts.push(`Added to map: ${pursuit.addedToMap}`);
  }
  if (pursuit.completedAt) {
    facts.push(`Completed: ${pursuit.completedAt}`);
    if (dateOfBirth) {
      const ageAtCompletion = ageAtCalendarDate(dateOfBirth, pursuit.completedAt);
      if (ageAtCompletion != null) facts.push(`Age at completion: ${ageAtCompletion}`);
    }
  }
  if (pursuit.deadline) {
    const label = formatDeadlineLabel(pursuit.deadline);
    const until = pursuit.daysUntilDeadline ?? daysUntil(pursuit.deadline, now);
    if (until != null) {
      facts.push(`Deadline: ${label ?? pursuit.deadline} (${until}d)`);
    } else {
      facts.push(`Deadline: ${label ?? pursuit.deadline}`);
    }
  }
  const hasTarget = (pursuit.targetAmount ?? 0) > 0;
  const hasCurrent = (pursuit.currentAmount ?? 0) > 0;
  if (hasTarget || hasCurrent) {
    const unit = pursuit.unit?.trim() ? ` ${pursuit.unit.trim()}` : "";
    if (hasCurrent && hasTarget) {
      facts.push(`Amount: ${pursuit.currentAmount}/${pursuit.targetAmount}${unit}`);
    } else if (hasTarget) {
      facts.push(`Amount target: ${pursuit.targetAmount}${unit}`);
    } else {
      facts.push(`Amount: ${pursuit.currentAmount}${unit}`);
    }
  }

  const signal = computePursuitSignal(pursuit, now);
  if (signal === "gap") {
    facts.push(`Reading signal: gap — ${formatGapFactLine(pursuit, now)}`);
  } else if (signal === "arrival") {
    facts.push("Reading signal: arrival — recently completed");
  }

  facts.push(...buildMilestonePaceFacts([pursuit], now));
  return facts;
}

function findPursuitsInMapContext(
  mapContext: FormattedMapContext,
  pursuitIds: string[],
): FormattedMapPursuit[] {
  const ids = new Set(pursuitIds);
  const found: FormattedMapPursuit[] = [];
  for (const theme of mapContext.themes) {
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        if (ids.has(pursuit.id)) found.push(pursuit);
      }
    }
  }
  return found;
}

/** Per-pursuit focal facts block for dirty pursuit IDs in reflect/enrich user messages. */
export function buildFocalPursuitFactsBlock(
  mapContext: FormattedMapContext,
  pursuitIds: string[],
  now = Date.now(),
  dateOfBirth: Date | null = null,
): Record<string, { title: string; facts: string[] }> {
  const block: Record<string, { title: string; facts: string[] }> = {};
  for (const pursuit of findPursuitsInMapContext(mapContext, pursuitIds)) {
    block[pursuit.id] = {
      title: pursuit.title,
      facts: buildFocalPursuitReadingFacts(pursuit, now, dateOfBirth),
    };
  }
  return block;
}
