import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/branch-sequence";
import { getLifeArea } from "@/lib/life-areas";
import { prisma } from "@/lib/prisma";
import { displayMarkTitleFromInput } from "@/lib/validation/marks-and-branches";
import type { AmbiguousItem, StreamAmbiguousResolution } from "@/types/stream";

type UnresolvedAmbiguousMark = {
  id: string;
  branchId: string;
  limbId: string;
  title: string;
  description: string | null;
};

type AmbiguousMarkResult =
  | { ok: true; mark: UnresolvedAmbiguousMark }
  | { ok: false; error: string; status: number };

/** Place ambiguous Stream items on the hub as unresolved marks (visible on tree). */
export async function commitAmbiguousItemsToBranch(
  userId: string,
  branchId: string,
  limbId: string,
  items: AmbiguousItem[],
): Promise<{ created: number; committed: number; markIds: string[] }> {
  const markIds: string[] = [];
  let created = 0;
  let committed = 0;

  await prisma.$transaction(async (tx) => {
    const appendAnchor = { kind: "append" as const };
    const nextSequencePosition = async () => {
      const nodes = await loadBranchSequencedNodes(tx, branchId);
      const resolution = resolveSequenceAnchor(nodes, appendAnchor);
      await applySequenceResolution(tx, resolution);
      return resolution.sequencePosition;
    };

    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);

    for (const item of items) {
      const title = displayMarkTitleFromInput(item.label, undefined);
      if (!title) continue;

      const existing = item.id
        ? await tx.mark.findFirst({
            where: {
              userId,
              branchId,
              streamAmbiguousId: item.id,
              archived: false,
              needsResolution: true,
            },
            select: { id: true },
          })
        : null;
      if (existing) {
        markIds.push(existing.id);
        created += 1;
        committed += 1;
        continue;
      }

      const sequencePosition = await nextSequencePosition();
      const mark = await tx.mark.create({
        data: {
          userId,
          branchId,
          limbId,
          title,
          description: item.reason?.trim() || null,
          date: today,
          sentiment: "neutral",
          archived: false,
          sequencePosition,
          kind: "stream",
          needsResolution: true,
          streamAmbiguousId: item.id,
        },
        select: { id: true },
      });
      markIds.push(mark.id);
      created += 1;
      committed += 1;
    }
  });

  return { created, committed, markIds };
}

async function getUnresolvedAmbiguousMark(
  userId: string,
  markId: string,
): Promise<AmbiguousMarkResult> {
  const mark = await prisma.mark.findFirst({
    where: { id: markId, userId, archived: false, needsResolution: true },
    select: { id: true, branchId: true, limbId: true, title: true, description: true },
  });
  if (!mark) {
    return { ok: false, error: "Unresolved mark not found", status: 404 };
  }
  return { ok: true, mark };
}

export async function moveUnresolvedMarkToBranch(
  userId: string,
  markId: string,
  targetBranchId: string,
): Promise<AmbiguousMarkResult> {
  const current = await getUnresolvedAmbiguousMark(userId, markId);
  if (!current.ok) return current;
  const { mark } = current;

  if (mark.branchId === targetBranchId) {
    return { ok: true, mark };
  }

  const targetBranch = await prisma.branch.findFirst({
    where: { id: targetBranchId, userId },
    select: { id: true, limbId: true },
  });
  if (!targetBranch) {
    return { ok: false, error: "Target hub not found", status: 400 };
  }

  let moved: UnresolvedAmbiguousMark | null = null;
  await prisma.$transaction(async (tx) => {
    const nodes = await loadBranchSequencedNodes(tx, targetBranch.id);
    const seqRes = resolveSequenceAnchor(nodes, { kind: "append" });
    await applySequenceResolution(tx, seqRes);

    moved = await tx.mark.update({
      where: { id: mark.id },
      data: {
        branchId: targetBranch.id,
        limbId: targetBranch.limbId,
        sequencePosition: seqRes.sequencePosition,
      },
      select: { id: true, branchId: true, limbId: true, title: true, description: true },
    });
  });

  return { ok: true, mark: moved ?? { ...mark, branchId: targetBranch.id, limbId: targetBranch.limbId } };
}

export async function resolveAmbiguousMark(
  userId: string,
  markId: string,
  resolution: StreamAmbiguousResolution,
  targetBranchId?: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const markResult = targetBranchId
    ? await moveUnresolvedMarkToBranch(userId, markId, targetBranchId)
    : await getUnresolvedAmbiguousMark(userId, markId);
  if (!markResult.ok) return markResult;

  const { mark } = markResult;

  if (resolution === "done") {
    await prisma.mark.update({
      where: { id: mark.id },
      data: { needsResolution: false, streamAmbiguousId: null },
    });
    return { ok: true };
  }

  const lifeArea = getLifeArea(mark.limbId)?.label ?? "Other";
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  await prisma.$transaction(async (tx) => {
    const appendAnchor = { kind: "append" as const };
    const nodes = await loadBranchSequencedNodes(tx, targetBranchId ?? mark.branchId);
    const seqRes = resolveSequenceAnchor(nodes, appendAnchor);
    await applySequenceResolution(tx, seqRes);

    await tx.goal.create({
      data: {
        userId,
        branchId: mark.branchId,
        limbId: mark.limbId,
        title: mark.title,
        description: mark.description?.trim() || "",
        lifeArea,
        goalType: "project",
        bloomStatus: "ACTIVE",
        year: defaultYear,
        month: defaultMonth,
        future: false,
        sequencePosition: seqRes.sequencePosition,
        aiGenerated: false,
      },
    });

    await tx.mark.update({
      where: { id: mark.id },
      data: { archived: true, needsResolution: false, streamAmbiguousId: null },
    });
  });

  return { ok: true };
}
