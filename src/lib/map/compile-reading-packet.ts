import { formatMapContext, type FormattedMapContext, type FormattedMapPursuit } from "@/lib/ai/format-map-context";
import { getLifeArea } from "@/lib/life-areas";
import {
  listReadingDirtyRows,
  type ReadingDirtyAnalysis,
  type ReadingDirtyRow,
} from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";

export type ReadingPacketPursuit = {
  title: string;
  status: string;
  deadline?: string;
  significance: number;
};

export type ReadingPacketCategorySignal = {
  themeLabel: string;
  categoryLabel: string;
  byStatus: Record<string, number>;
  pursuits: ReadingPacketPursuit[];
  facts: string[];
};

export type ReadingPacket = {
  changeEvents: string[];
  categorySignals: ReadingPacketCategorySignal[];
  mapAggregates: {
    totalPursuits: number;
    upcomingDeadlines14d: number;
    upcomingDeadlines30d: number;
    recentCompletions: number;
    highSignificanceActive: string[];
  };
};

const MS_PER_DAY = 86_400_000;

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

function flattenPursuits(mapContext: FormattedMapContext): Array<
  FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string; categoryId: string }
> {
  const rows: Array<
    FormattedMapPursuit & { themeId: string; themeLabel: string; categoryLabel: string; categoryId: string }
  > = [];
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        rows.push({
          ...pursuit,
          themeId: theme.id,
          themeLabel: theme.label,
          categoryLabel: hub.section || hub.label,
          categoryId: hub.id,
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
      events.push(`Pursuit added: "${label}"`);
      continue;
    }
    if (details.event === "archived") {
      events.push(`Pursuit archived: "${label}"`);
      continue;
    }
    if (row.entityType === "mark") {
      if (details.event === "created") {
        events.push(`Mark added: "${label}"`);
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

    signals.push({
      themeLabel: sample.themeLabel,
      categoryLabel: sample.categoryLabel,
      byStatus,
      pursuits: categoryPursuits.map((p) => ({
        title: p.title,
        status: p.status,
        deadline: p.deadline,
        significance: p.significance,
      })),
      facts,
    });
  }

  return signals.sort((a, b) =>
    `${a.themeLabel}:${a.categoryLabel}`.localeCompare(`${b.themeLabel}:${b.categoryLabel}`),
  );
}

export function buildMapAggregates(
  pursuits: ReturnType<typeof flattenPursuits>,
  now = Date.now(),
): ReadingPacket["mapAggregates"] {
  let upcomingDeadlines14d = 0;
  let upcomingDeadlines30d = 0;
  let recentCompletions = 0;
  const highSignificanceActive: string[] = [];

  for (const pursuit of pursuits) {
    if (pursuit.status === "COMPLETE") {
      recentCompletions += 1;
    }
    if (
      (pursuit.status === "ACTIVE" || pursuit.status === "MAINTAINING") &&
      pursuit.significance >= 4
    ) {
      highSignificanceActive.push(pursuit.title);
    }
    if (!pursuit.deadline) continue;
    if (pursuit.status === "COMPLETE" || pursuit.status === "ABANDONED" || pursuit.status === "PAUSED") {
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
    recentCompletions,
    highSignificanceActive: highSignificanceActive.slice(0, 6),
  };
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

export async function compileReadingPacket(
  userId: string,
  dirty: ReadingDirtyAnalysis,
): Promise<ReadingPacket> {
  const [mapContext, dirtyRows, focusCategoryIds] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    listReadingDirtyRows(userId),
    resolveFocusCategoryIds(userId, dirty),
  ]);

  const pursuits = flattenPursuits(mapContext);
  const changeEvents = buildChangeEventsFromDirtyRows(
    dirtyRows.filter(
      (row) =>
        row.entityType === "pursuit" ||
        row.entityType === "mark" ||
        (row.entityType === "global" && row.reason.includes("mark")),
    ),
  );

  return {
    changeEvents,
    categorySignals: buildCategorySignals(pursuits, focusCategoryIds),
    mapAggregates: buildMapAggregates(pursuits),
  };
}

export function readingPacketToJson(packet: ReadingPacket): string {
  return JSON.stringify(packet, null, 2);
}

/** Theme label helper for tests. */
export function themeLabelForId(themeId: string): string {
  return getLifeArea(themeId)?.label ?? themeId;
}
