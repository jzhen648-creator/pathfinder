/**
 * Stream confirmation queue helpers for dogfood scripts (API-only; no desktop UI).
 */
import type {
  AmbiguousItem,
  ExtractedMark,
  ExtractedMilestone,
  ExtractedPursuit,
  StreamExtractResponse,
  StreamItemOrderEntry,
} from "../../src/types/stream";

export type ConfirmationKind = "mark" | "pursuit" | "milestone" | "ambiguous";

export type ConfirmationQueueItem =
  | { id: string; kind: "mark"; item: ExtractedMark }
  | { id: string; kind: "pursuit"; item: ExtractedPursuit }
  | { id: string; kind: "milestone"; item: ExtractedMilestone; pursuitLabel: string }
  | { id: string; kind: "ambiguous"; item: AmbiguousItem };

export type StreamCardVariant =
  | "mark"
  | "pursuit-peer"
  | "pursuit-child"
  | "milestone"
  | "ambiguous";

export function streamCardVariant(item: ConfirmationQueueItem): StreamCardVariant {
  if (item.kind === "ambiguous") return "ambiguous";
  if (item.kind === "mark") return "mark";
  if (item.kind === "milestone") return "milestone";
  return "pursuit-peer";
}

function milestonePursuitLabel(ms: ExtractedMilestone, titleByRef: Map<string, string>): string {
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
    return { id: `mark-${entry.index}`, kind: "mark", item };
  }
  if (entry.kind === "pursuit") {
    const item = extraction.pursuits[entry.index];
    if (!item) return null;
    return { id: `pursuit-${entry.index}`, kind: "pursuit", item };
  }
  const item = extraction.milestones[entry.index];
  if (!item) return null;
  return {
    id: `milestone-${entry.index}`,
    kind: "milestone",
    item,
    pursuitLabel: milestonePursuitLabel(item, titleByRef),
  };
}

function fallbackOrderedItems(
  extraction: StreamExtractResponse,
  titleByRef: Map<string, string>,
): ConfirmationQueueItem[] {
  const items: ConfirmationQueueItem[] = [];
  extraction.marks.forEach((m, index) => {
    items.push({ id: `mark-${index}`, kind: "mark", item: m });
  });
  extraction.pursuits.forEach((p, index) => {
    items.push({ id: `pursuit-${index}`, kind: "pursuit", item: p });
  });
  extraction.milestones.forEach((ms, index) => {
    items.push({
      id: `milestone-${index}`,
      kind: "milestone",
      item: ms,
      pursuitLabel: milestonePursuitLabel(ms, titleByRef),
    });
  });
  return items;
}

/** Order structured extract items the same way the desktop Stream confirmation UI did. */
export function buildQueue(
  extraction: StreamExtractResponse,
  titleByRef: Map<string, string>,
): ConfirmationQueueItem[] {
  const { marks, pursuits, milestones, itemOrder } = extraction;

  if (
    itemOrder.length > 0 &&
    isItemOrderValid(itemOrder, marks.length, pursuits.length, milestones.length)
  ) {
    const ordered: ConfirmationQueueItem[] = [];
    for (const entry of itemOrder) {
      const resolved = resolveOrderEntry(entry, extraction, titleByRef);
      if (resolved) ordered.push(resolved);
    }
    return ordered;
  }

  return fallbackOrderedItems(extraction, titleByRef);
}
