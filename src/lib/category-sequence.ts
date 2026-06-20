/**
 * Category-line sequence position resolver for pursuit insertion / reorganize APIs.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export const STEP = 100;
export const INITIAL_POSITION = 100;
export const MIN_SEQUENCE_GAP = 1e-3;

export type SequenceAnchor =
  | { kind: "append" }
  | { kind: "after"; nodeId: string }
  | { kind: "before"; nodeId: string }
  | { kind: "between"; afterNodeId: string; beforeNodeId: string };

export type BranchNodeRow = {
  id: string;
  table: "goal";
  sequencePosition: number | null;
};

export async function loadCategorySequencedNodes(
  prisma: PrismaClient | Prisma.TransactionClient,
  categoryId: string,
): Promise<BranchNodeRow[]> {
  const goals = await prisma.goal.findMany({
    where: { categoryId, parentGoalId: null, archived: false },
    select: { id: true, sequencePosition: true, createdAt: true, year: true, month: true },
  });

  const rows = goals
    .map((goal) => ({
      id: goal.id,
      table: "goal" as const,
      sequencePosition: goal.sequencePosition,
      sortFallback:
        (goal.year ?? 9999) * 10000 + (goal.month ?? 0) * 100 + goal.createdAt.getTime() / 1e12,
    }))
    .sort((a, b) => {
      if (a.sequencePosition != null && b.sequencePosition != null) {
        return a.sequencePosition - b.sequencePosition;
      }
      if (a.sequencePosition != null) return -1;
      if (b.sequencePosition != null) return 1;
      return a.sortFallback - b.sortFallback;
    });

  return rows.map(({ id, table, sequencePosition }) => ({ id, table, sequencePosition }));
}

export type SequenceUpdate = { id: string; table: "goal"; sequencePosition: number };

export type ResolveOutcome =
  | { kind: "single"; sequencePosition: number; reindexed: false }
  | {
      kind: "reindex";
      sequencePosition: number;
      updates: SequenceUpdate[];
      reindexed: true;
    };

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
  const maxSeq =
    positioned.length > 0 ? Math.max(...positioned.map((n) => n.sequencePosition)) : 0;

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
  const newSeq = ((lowIdx + 1) * STEP + (highIdx + 1) * STEP) / 2;
  return { kind: "reindex", sequencePosition: newSeq, updates, reindexed: true };
}

export async function applySequenceResolution(
  tx: Prisma.TransactionClient,
  outcome: ResolveOutcome,
): Promise<void> {
  if (outcome.kind !== "reindex") return;
  for (const update of outcome.updates) {
    await tx.goal.update({
      where: { id: update.id },
      data: { sequencePosition: update.sequencePosition },
    });
  }
}
