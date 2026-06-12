/**
 * Branch-line sequence position resolver — shared by goal and mark insertion APIs.
 *
 * Resolves an explicit anchor (`between` / `after` / `before` / `append`) to a `sequencePosition`
 * scalar that can be written to either `Goal.sequencePosition` or `Mark.sequencePosition`. Both
 * tables co-sort on this scalar inside `mapToTreeData` to form the unified `sequencedNodes` list.
 *
 * Reindex behaviour: when the minimum gap on a branch falls below {@link MIN_SEQUENCE_GAP}, the
 * resolver rewrites all `sequencePosition` values on that branch to clean multiples of {@link STEP}
 * inside a single transaction. Empirically a branch will hold tens of nodes, not thousands, so the
 * rewrite is cheap. No external fractional-indexing library required.
 *
 * Continuation children (`Goal.parentGoalId != null`) are **excluded** from the sequence — they keep
 * the parent-anchored satellite layout (`continuationChildScreenPosition`). The resolver ignores them.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/** Step size between freshly-assigned positions (`100, 200, 300, …`). Roomy for midpoint inserts. */
export const STEP = 100;
/** Initial position when a branch is empty and a node is appended. */
export const INITIAL_POSITION = 100;
/** Minimum gap (sequencePosition delta) below which the resolver reindexes the branch. */
export const MIN_SEQUENCE_GAP = 1e-3;

export type SequenceAnchor =
  | { kind: "append" }
  | { kind: "after"; nodeId: string }
  | { kind: "before"; nodeId: string }
  | { kind: "between"; afterNodeId: string; beforeNodeId: string };

export type BranchNodeRow = {
  id: string;
  table: "goal" | "mark";
  sequencePosition: number | null;
};

/**
 * Load all sequenced nodes on a branch — non-evolution goals (`parentGoalId IS NULL`) merged with
 * non-archived marks. Goals with `goalType: moment|event` are included as goal-table rows so they
 * participate in ordering until the separately-scoped retirement sprint runs. Sorted by current
 * `sequencePosition` (nulls last); rows missing a position sort to the tail in a deterministic order.
 */
export async function loadCategorySequencedNodes(
  prisma: PrismaClient | Prisma.TransactionClient,
  categoryId: string,
): Promise<BranchNodeRow[]> {
  const [goals, marks] = await Promise.all([
    prisma.goal.findMany({
      where: { categoryId, parentGoalId: null, archived: false },
      select: { id: true, sequencePosition: true, createdAt: true, year: true, month: true },
    }),
    prisma.mark.findMany({
      where: { categoryId, archived: false },
      select: { id: true, sequencePosition: true, createdAt: true, year: true, month: true, date: true },
    }),
  ]);
  const rows: Array<BranchNodeRow & { sortFallback: number }> = [
    ...goals.map((g) => ({
      id: g.id,
      table: "goal" as const,
      sequencePosition: g.sequencePosition,
      sortFallback:
        (g.year ?? 9999) * 10000 + (g.month ?? 0) * 100 + g.createdAt.getTime() / 1e12,
    })),
    ...marks.map((m) => ({
      id: m.id,
      table: "mark" as const,
      sequencePosition: m.sequencePosition,
      sortFallback:
        (m.year ?? (m.date ? m.date.getFullYear() : 9999)) * 10000 +
        (m.month ?? (m.date ? m.date.getMonth() + 1 : 0)) * 100 +
        m.createdAt.getTime() / 1e12,
    })),
  ];
  rows.sort((a, b) => {
    if (a.sequencePosition != null && b.sequencePosition != null) {
      return a.sequencePosition - b.sequencePosition;
    }
    if (a.sequencePosition != null) return -1;
    if (b.sequencePosition != null) return 1;
    return a.sortFallback - b.sortFallback;
  });
  return rows.map(({ id, table, sequencePosition }) => ({ id, table, sequencePosition }));
}

export type SequenceUpdate = { id: string; table: "goal" | "mark"; sequencePosition: number };

export type ResolveOutcome =
  | { kind: "single"; sequencePosition: number; reindexed: false }
  | {
      kind: "reindex";
      sequencePosition: number;
      /** Updates to apply to all nodes on the branch before (or alongside) the new row insert. */
      updates: SequenceUpdate[];
      reindexed: true;
    };

/**
 * Resolve an anchor to a concrete `sequencePosition` value. May return updates that reindex the
 * branch when midpoint precision collapses — callers should apply those updates in the same
 * transaction as the new-row insert (use {@link applySequenceResolution}).
 */
export function resolveSequenceAnchor(
  nodes: BranchNodeRow[],
  anchor: SequenceAnchor,
): ResolveOutcome {
  if (nodes.length === 0) {
    return { kind: "single", sequencePosition: INITIAL_POSITION, reindexed: false };
  }
  const positioned = nodes.filter((n) => n.sequencePosition != null) as Array<
    BranchNodeRow & { sequencePosition: number }
  >;
  const maxSeq = positioned.length > 0
    ? Math.max(...positioned.map((n) => n.sequencePosition))
    : 0;

  if (anchor.kind === "append") {
    return { kind: "single", sequencePosition: maxSeq + STEP, reindexed: false };
  }

  if (anchor.kind === "after") {
    const target = nodes.find((n) => n.id === anchor.nodeId);
    if (!target || target.sequencePosition == null) {
      return { kind: "single", sequencePosition: maxSeq + STEP, reindexed: false };
    }
    const idx = nodes.indexOf(target);
    const nextWithPos = nodes
      .slice(idx + 1)
      .find((n) => n.sequencePosition != null) as (BranchNodeRow & { sequencePosition: number }) | undefined;
    if (!nextWithPos) {
      return { kind: "single", sequencePosition: target.sequencePosition + STEP, reindexed: false };
    }
    const mid = (target.sequencePosition + nextWithPos.sequencePosition) / 2;
    if (nextWithPos.sequencePosition - target.sequencePosition < MIN_SEQUENCE_GAP) {
      return reindexAround(nodes, target.id, nextWithPos.id);
    }
    return { kind: "single", sequencePosition: mid, reindexed: false };
  }

  if (anchor.kind === "before") {
    const target = nodes.find((n) => n.id === anchor.nodeId);
    if (!target || target.sequencePosition == null) {
      return { kind: "single", sequencePosition: INITIAL_POSITION, reindexed: false };
    }
    const idx = nodes.indexOf(target);
    const prevWithPos = [...nodes.slice(0, idx)]
      .reverse()
      .find((n) => n.sequencePosition != null) as (BranchNodeRow & { sequencePosition: number }) | undefined;
    if (!prevWithPos) {
      return { kind: "single", sequencePosition: target.sequencePosition / 2, reindexed: false };
    }
    const mid = (prevWithPos.sequencePosition + target.sequencePosition) / 2;
    if (target.sequencePosition - prevWithPos.sequencePosition < MIN_SEQUENCE_GAP) {
      return reindexAround(nodes, prevWithPos.id, target.id);
    }
    return { kind: "single", sequencePosition: mid, reindexed: false };
  }

  /** between */
  const a = nodes.find((n) => n.id === anchor.afterNodeId);
  const b = nodes.find((n) => n.id === anchor.beforeNodeId);
  if (!a || !b || a.sequencePosition == null || b.sequencePosition == null) {
    return { kind: "single", sequencePosition: maxSeq + STEP, reindexed: false };
  }
  const lo = Math.min(a.sequencePosition, b.sequencePosition);
  const hi = Math.max(a.sequencePosition, b.sequencePosition);
  if (hi - lo < MIN_SEQUENCE_GAP) {
    return reindexAround(nodes, a.id, b.id);
  }
  return { kind: "single", sequencePosition: (lo + hi) / 2, reindexed: false };
}

/**
 * Rebuild the entire branch's `sequencePosition` to clean `STEP`-multiple values and insert a new
 * slot midway between `afterId` and `beforeId` (whichever is earlier in the rebuilt order).
 */
function reindexAround(
  nodes: BranchNodeRow[],
  afterId: string,
  beforeId: string,
): ResolveOutcome {
  const ordered = nodes.slice();
  const aIdx = ordered.findIndex((n) => n.id === afterId);
  const bIdx = ordered.findIndex((n) => n.id === beforeId);
  const lowIdx = Math.min(aIdx, bIdx);
  const highIdx = Math.max(aIdx, bIdx);
  if (lowIdx < 0 || highIdx < 0) {
    /** Fallback: degenerate input — append at end. */
    const positioned = nodes.filter((n) => n.sequencePosition != null) as Array<
      BranchNodeRow & { sequencePosition: number }
    >;
    const max = positioned.length > 0 ? Math.max(...positioned.map((n) => n.sequencePosition)) : 0;
    return { kind: "single", sequencePosition: max + STEP, reindexed: false };
  }
  const updates: SequenceUpdate[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const node = ordered[i]!;
    const cleanPos = (i + 1) * STEP;
    if (node.sequencePosition !== cleanPos) {
      updates.push({ id: node.id, table: node.table, sequencePosition: cleanPos });
    }
  }
  /** New row goes between the reindexed `low` and `high` slots — midpoint of their fresh positions. */
  const newSeq = ((lowIdx + 1) * STEP + (highIdx + 1) * STEP) / 2;
  return { kind: "reindex", sequencePosition: newSeq, updates, reindexed: true };
}

/**
 * Apply the reindex updates from a {@link ResolveOutcome} inside a Prisma transaction. Use this on
 * the branch nodes before/alongside inserting the new row; the new row uses
 * {@link ResolveOutcome.sequencePosition}.
 */
export async function applySequenceResolution(
  tx: Prisma.TransactionClient,
  outcome: ResolveOutcome,
): Promise<void> {
  if (outcome.kind !== "reindex") return;
  for (const update of outcome.updates) {
    if (update.table === "goal") {
      await tx.goal.update({
        where: { id: update.id },
        data: { sequencePosition: update.sequencePosition },
      });
    } else {
      await tx.mark.update({
        where: { id: update.id },
        data: { sequencePosition: update.sequencePosition },
      });
    }
  }
}

/** @deprecated Use {@link loadCategorySequencedNodes}. */
export const loadBranchSequencedNodes = loadCategorySequencedNodes;
