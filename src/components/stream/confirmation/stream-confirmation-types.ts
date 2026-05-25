import { formatBloomStatusLabel } from "@/lib/bloom-display";
import type {
  AmbiguousItem,
  ExtractedMark,
  ExtractedMilestone,
  ExtractedPursuit,
  StreamAmbiguousResolution,
  StreamExtractResponse,
  StreamHubUiContext,
  StreamItemOrderEntry,
  StreamSessionCommitFields,
  StreamThemeUiContext,
} from "@/types/stream";

export type ConfirmationKind = "mark" | "pursuit" | "milestone" | "ambiguous";

export type ConfirmationQueueItem =
  | { id: string; kind: "mark"; item: ExtractedMark }
  | { id: string; kind: "pursuit"; item: ExtractedPursuit }
  | { id: string; kind: "milestone"; item: ExtractedMilestone; pursuitLabel: string }
  | { id: string; kind: "ambiguous"; item: AmbiguousItem };

export type StreamDecision =
  | {
      queueId: string;
      kind: "mark";
      action: "add";
      item: ExtractedMark;
    }
  | {
      queueId: string;
      kind: "pursuit";
      action: "add";
      item: ExtractedPursuit;
    }
  | {
      queueId: string;
      kind: "milestone";
      action: "add";
      item: ExtractedMilestone;
    }
  | {
      queueId: string;
      kind: "ambiguous";
      action: "resolve";
      item: AmbiguousItem;
      resolution: StreamAmbiguousResolution;
    }
  | {
      queueId: string;
      kind: ConfirmationKind;
      action: "skip";
    };

export type MarkEdit = Partial<Pick<ExtractedMark, "title" | "date" | "hubId">>;
export type PursuitEdit = Partial<
  Pick<
    ExtractedPursuit,
    "title" | "description" | "goalType" | "bloomStatus" | "hubId" | "deadline"
  >
>;
export type MilestoneEdit = Partial<Pick<ExtractedMilestone, "title" | "hubId">>;

export type QueueEdits = Record<string, MarkEdit | PursuitEdit | MilestoneEdit>;

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultPursuitDeadlineYmd(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeDateYmd(raw: string | null): string {
  if (!raw?.trim()) return todayYmd();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m?.[1] ?? todayYmd();
}

/** Returns YYYY-MM-DD when valid, otherwise null (deadlines are optional). */
export function normalizeDeadlineYmd(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
  return m?.[1] ?? null;
}

export function hasPursuitReview(pursuit: ExtractedPursuit): boolean {
  const suggested = pursuit.suggestedTitle?.trim();
  const note = pursuit.reviewNote?.trim();
  const event = pursuit.eventContext?.trim();
  const titleNorm = pursuit.title.trim().toLowerCase();
  const suggestedDiffers =
    Boolean(suggested) && suggested!.trim().toLowerCase() !== titleNorm;
  return Boolean(suggestedDiffers || note || event);
}

export function formatPursuitDeadlineDisplay(deadline: string | null | undefined): string {
  const ymd = normalizeDeadlineYmd(deadline ?? null);
  if (!ymd) return "No deadline";
  const [, y, mo, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) ?? [];
  if (!y || !mo || !d) return "No deadline";
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return dt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function kindLabel(kind: ConfirmationKind): string {
  switch (kind) {
    case "mark":
      return "MARK";
    case "pursuit":
      return "PURSUIT";
    case "milestone":
      return "MILESTONE";
    case "ambiguous":
      return "NEEDS YOUR CALL";
  }
}

export function formatMarkDetail(date: string | null): string {
  const ymd = normalizeDateYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Prominent mark date for confirmation cards; null/empty → "Today". */
export function formatMarkDisplayDate(date: string | null): string {
  if (!date?.trim()) return "Today";
  return formatMarkDetail(date);
}

export function formatPursuitPeerDetail(pursuit: ExtractedPursuit): string {
  return `${pursuit.goalType} · ${formatBloomStatusLabel(pursuit.bloomStatus)}`;
}

export function pursuitParentLabel(
  pursuit: ExtractedPursuit,
  titleByRef: Map<string, string>,
  sessionPursuits: ExtractedPursuit[] = [],
): string | null {
  if (!pursuit.parentRef) return null;
  if (pursuit.parentRef.kind === "existing") {
    return titleByRef.get(pursuit.parentRef.goalId) ?? null;
  }
  const key = pursuit.parentRef.clientKey;
  const mapped = titleByRef.get(key);
  if (mapped) return mapped;
  return sessionPursuits.find((p) => p.clientKey === key)?.title ?? null;
}

export function formatPursuitDetail(
  pursuit: ExtractedPursuit,
  titleByRef?: Map<string, string>,
): string {
  let detail = `${pursuit.goalType} · ${formatBloomStatusLabel(pursuit.bloomStatus)}`;
  if (titleByRef) {
    const parentTitle = pursuitParentLabel(pursuit, titleByRef);
    if (parentTitle) {
      detail += ` · under ${parentTitle}`;
    }
  }
  return detail;
}

export function buildPursuitTitleByRef(
  hub: StreamHubUiContext,
  pursuits: ExtractedPursuit[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of hub.existingGoals ?? []) {
    map.set(g.id, g.title);
  }
  for (const p of pursuits) {
    if (p.clientKey) map.set(p.clientKey, p.title);
    if (p.existingGoalId) map.set(p.existingGoalId, p.title);
  }
  return map;
}

export function buildPursuitTitleByRefForTheme(
  theme: StreamThemeUiContext,
  pursuits: ExtractedPursuit[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const hub of theme.hubs) {
    for (const g of hub.existingGoals ?? []) {
      map.set(g.id, g.title);
    }
  }
  for (const p of pursuits) {
    if (p.clientKey) map.set(p.clientKey, p.title);
    if (p.existingGoalId) map.set(p.existingGoalId, p.title);
  }
  return map;
}

function milestonePursuitLabel(
  ms: ExtractedMilestone,
  titleByRef: Map<string, string>,
): string {
  if (ms.pursuitRef.kind === "existing") {
    return titleByRef.get(ms.pursuitRef.goalId) ?? "Existing pursuit";
  }
  return titleByRef.get(ms.pursuitRef.clientKey) ?? "New pursuit";
}

function isItemOrderValid(
  order: StreamItemOrderEntry[],
  marksLen: number,
  pursuitsLen: number,
  milestonesLen: number,
): boolean {
  const expected = marksLen + pursuitsLen + milestonesLen;
  if (order.length !== expected) return false;
  const seen = new Set<string>();
  for (const entry of order) {
    const key = `${entry.kind}:${entry.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (entry.kind === "mark" && entry.index >= marksLen) return false;
    if (entry.kind === "pursuit" && entry.index >= pursuitsLen) return false;
    if (entry.kind === "milestone" && entry.index >= milestonesLen) return false;
  }
  return seen.size === expected;
}

function resolveOrderEntry(
  entry: StreamItemOrderEntry,
  extraction: StreamExtractResponse,
  titleByRef: Map<string, string>,
): ConfirmationQueueItem | null {
  if (entry.kind === "mark") {
    const item = extraction.marks[entry.index];
    if (!item) return null;
    return {
      id: `mark-${entry.index}`,
      kind: "mark",
      item: { ...item, date: normalizeDateYmd(item.date) },
    };
  }
  if (entry.kind === "pursuit") {
    const item = extraction.pursuits[entry.index];
    if (!item) return null;
    return {
      id: `pursuit-${entry.index}`,
      kind: "pursuit",
      item: { ...item, deadline: normalizeDeadlineYmd(item.deadline) ?? defaultPursuitDeadlineYmd() },
    };
  }
  const item = extraction.milestones[entry.index];
  if (!item) return null;
  return {
    id: `milestone-${entry.index}`,
    kind: "milestone",
    item: { ...item },
    pursuitLabel: milestonePursuitLabel(item, titleByRef),
  };
}

function fallbackOrderedItems(
  extraction: StreamExtractResponse,
  titleByRef: Map<string, string>,
): ConfirmationQueueItem[] {
  const items: ConfirmationQueueItem[] = [];
  extraction.marks.forEach((m, index) => {
    items.push({
      id: `mark-${index}`,
      kind: "mark",
      item: { ...m, date: normalizeDateYmd(m.date) },
    });
  });
  extraction.pursuits.forEach((p, index) => {
    items.push({
      id: `pursuit-${index}`,
      kind: "pursuit",
      item: { ...p, deadline: normalizeDeadlineYmd(p.deadline) ?? defaultPursuitDeadlineYmd() },
    });
  });
  extraction.milestones.forEach((ms, index) => {
    items.push({
      id: `milestone-${index}`,
      kind: "milestone",
      item: { ...ms },
      pursuitLabel: milestonePursuitLabel(ms, titleByRef),
    });
  });
  return items;
}

export function buildQueue(
  extraction: StreamExtractResponse,
  hubOrTitleByRef: StreamHubUiContext | Map<string, string>,
): ConfirmationQueueItem[] {
  const titleByRef =
    hubOrTitleByRef instanceof Map
      ? hubOrTitleByRef
      : buildPursuitTitleByRef(hubOrTitleByRef, extraction.pursuits);
  const { marks, pursuits, milestones, ambiguous, itemOrder } = extraction;

  let ordered: ConfirmationQueueItem[] = [];
  if (
    itemOrder.length > 0 &&
    isItemOrderValid(itemOrder, marks.length, pursuits.length, milestones.length)
  ) {
    for (const entry of itemOrder) {
      const resolved = resolveOrderEntry(entry, extraction, titleByRef);
      if (resolved) ordered.push(resolved);
    }
  } else {
    ordered = fallbackOrderedItems(extraction, titleByRef);
  }

  return ordered;
}

export function mergeQueueItem(
  queueItem: ConfirmationQueueItem,
  edits: QueueEdits,
): ConfirmationQueueItem {
  const patch = edits[queueItem.id];
  if (!patch) return queueItem;
  if (queueItem.kind === "mark") {
    const p = patch as MarkEdit;
    return {
      ...queueItem,
      item: {
        ...queueItem.item,
        ...p,
        date: p.date !== undefined ? normalizeDateYmd(p.date) : queueItem.item.date,
      },
    };
  }
  if (queueItem.kind === "pursuit") {
    const p = patch as PursuitEdit;
    return {
      ...queueItem,
      item: {
        ...queueItem.item,
        ...p,
        deadline:
          p.deadline !== undefined
            ? normalizeDeadlineYmd(p.deadline)
            : queueItem.item.deadline,
      },
    };
  }
  if (queueItem.kind === "milestone") {
    return { ...queueItem, item: { ...queueItem.item, ...(patch as MilestoneEdit) } };
  }
  return queueItem;
}

export type StreamSingleCommitPayload = {
  marks: ExtractedMark[];
  pursuits: ExtractedPursuit[];
  milestones: ExtractedMilestone[];
  resolvedAmbiguous: Array<{ id: string; label: string; resolution: StreamAmbiguousResolution }>;
};

export type StreamThemeCommitBody = StreamSingleCommitPayload & StreamSessionCommitFields;

const EMPTY_COMMIT: StreamSingleCommitPayload = {
  marks: [],
  pursuits: [],
  milestones: [],
  resolvedAmbiguous: [],
};

export function preparePursuitForCommit(
  pursuit: ExtractedPursuit,
  skippedClientKeys: Set<string>,
  committedClientKeyToGoalId: Map<string, string>,
): ExtractedPursuit {
  if (!pursuit.parentRef) return pursuit;
  if (pursuit.parentRef.kind === "existing") return pursuit;
  const parentKey = pursuit.parentRef.clientKey;
  if (skippedClientKeys.has(parentKey)) {
    return { ...pursuit, parentRef: undefined };
  }
  const goalId = committedClientKeyToGoalId.get(parentKey);
  if (goalId) {
    return { ...pursuit, parentRef: { kind: "existing", goalId } };
  }
  return pursuit;
}

export function prepareMilestoneForCommit(
  milestone: ExtractedMilestone,
  skippedClientKeys: Set<string>,
  committedClientKeyToGoalId: Map<string, string>,
): ExtractedMilestone {
  if (milestone.pursuitRef.kind === "existing") return milestone;
  const key = milestone.pursuitRef.clientKey;
  if (skippedClientKeys.has(key)) return milestone;
  const goalId = committedClientKeyToGoalId.get(key);
  if (goalId) {
    return { ...milestone, pursuitRef: { kind: "existing", goalId } };
  }
  return milestone;
}

export function buildSingleCommitPayload(
  decision: StreamDecision,
  skippedClientKeys: Set<string>,
  committedClientKeyToGoalId: Map<string, string>,
): StreamSingleCommitPayload {
  if (decision.action === "skip") return { ...EMPTY_COMMIT };
  switch (decision.kind) {
    case "mark":
      return { ...EMPTY_COMMIT, marks: [decision.item] };
    case "pursuit":
      return {
        ...EMPTY_COMMIT,
        pursuits: [
          preparePursuitForCommit(decision.item, skippedClientKeys, committedClientKeyToGoalId),
        ],
      };
    case "milestone":
      return {
        ...EMPTY_COMMIT,
        milestones: [
          prepareMilestoneForCommit(decision.item, skippedClientKeys, committedClientKeyToGoalId),
        ],
      };
    case "ambiguous":
      return {
        ...EMPTY_COMMIT,
        resolvedAmbiguous: [
          { id: decision.item.id, label: decision.item.label, resolution: decision.resolution },
        ],
      };
  }
}

export function queueItemLabel(item: ConfirmationQueueItem): string {
  switch (item.kind) {
    case "mark":
    case "pursuit":
    case "milestone":
      return item.item.title;
    case "ambiguous":
      return item.item.label;
  }
}

/** Resolve a newly committed pursuit via existing `GET /api/branches` (filter by branch + title). */
export async function lookupGoalIdByTitle(branchId: string, title: string): Promise<string | null> {
  const res = await fetch("/api/branches", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    goals?: Array<{ id: string; branchId: string | null; title: string; goalType?: string }>;
  };
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const needle = title.trim().toLowerCase();
  const onBranch = goals.filter(
    (g) =>
      g.branchId === branchId &&
      g.goalType !== "moment" &&
      g.goalType !== "event" &&
      (g.title?.trim().toLowerCase() ?? "") === needle,
  );
  if (onBranch.length === 0) return null;
  return onBranch[onBranch.length - 1]!.id;
}

export async function postStreamCommit(
  hubId: string,
  payload: StreamSingleCommitPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/stream/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hubId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String((data as { error?: string })?.error ?? `Save failed (${res.status})`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while saving." };
  }
}

/** Count mark/pursuit/milestone adds; ambiguous resolve counts as one add. */
export function countStreamCommitItems(decisions: StreamDecision[]): {
  itemsAdded: number;
  itemsSkipped: number;
} {
  let itemsAdded = 0;
  let itemsSkipped = 0;
  for (const d of decisions) {
    if (d.action === "skip") {
      itemsSkipped += 1;
      continue;
    }
    if (d.kind === "mark" || d.kind === "pursuit" || d.kind === "milestone") {
      itemsAdded += 1;
    } else if (d.kind === "ambiguous") {
      itemsAdded += 1;
    }
  }
  return { itemsAdded, itemsSkipped };
}

export async function postStreamThemeCommit(
  themeId: string,
  payload: StreamThemeCommitBody,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/stream/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String((data as { error?: string })?.error ?? `Save failed (${res.status})`) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while saving." };
  }
}

export type StreamFailedCommit = {
  id: string;
  label: string;
  decision: StreamDecision;
};

export function buildBatchCommitPayload(
  decisions: StreamDecision[],
  skippedClientKeys: Set<string>,
): StreamSingleCommitPayload {
  const raw = buildCommitPayload(decisions);
  const committed = new Map<string, string>();
  return {
    marks: raw.marks,
    pursuits: raw.pursuits.map((p) =>
      preparePursuitForCommit(p, skippedClientKeys, committed),
    ),
    milestones: raw.milestones.map((m) =>
      prepareMilestoneForCommit(m, skippedClientKeys, committed),
    ),
    resolvedAmbiguous: raw.resolvedAmbiguous,
  };
}

export function buildCommitPayload(decisions: StreamDecision[]): {
  marks: ExtractedMark[];
  pursuits: ExtractedPursuit[];
  milestones: ExtractedMilestone[];
  resolvedAmbiguous: Array<{ id: string; label: string; resolution: StreamAmbiguousResolution }>;
} {
  const kept = decisions.filter((d) => d.action !== "skip");
  return {
    marks: kept.filter((d): d is Extract<StreamDecision, { kind: "mark"; action: "add" }> => d.kind === "mark" && d.action === "add").map((d) => d.item),
    pursuits: kept.filter((d): d is Extract<StreamDecision, { kind: "pursuit"; action: "add" }> => d.kind === "pursuit" && d.action === "add").map((d) => d.item),
    milestones: kept.filter((d): d is Extract<StreamDecision, { kind: "milestone"; action: "add" }> => d.kind === "milestone" && d.action === "add").map((d) => d.item),
    resolvedAmbiguous: kept
      .filter((d): d is Extract<StreamDecision, { kind: "ambiguous"; action: "resolve" }> => d.kind === "ambiguous" && d.action === "resolve")
      .map((d) => ({ id: d.item.id, label: d.item.label, resolution: d.resolution })),
  };
}

export function countDecisions(decisions: StreamDecision[]): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  for (const d of decisions) {
    if (d.action === "skip") skipped += 1;
    else added += 1;
  }
  return { added, skipped };
}
