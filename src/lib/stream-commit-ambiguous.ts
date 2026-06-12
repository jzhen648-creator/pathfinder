import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import { getLifeArea } from "@/lib/life-areas";
import { assignPursuitVisualsSafe } from "@/lib/ai/assign-pursuit-icon";
import { prisma } from "@/lib/prisma";
import { displayMarkTitleFromInput } from "@/lib/validation/marks-and-categories";
import type { AmbiguousItem, StreamAmbiguousResolution } from "@/types/stream";

type UnresolvedAmbiguousMark = {
  id: string;
  categoryId: string;
  themeId: string;
  title: string;
  description: string | null;
};

type AmbiguousMarkResult =
  | { ok: true; mark: UnresolvedAmbiguousMark }
  | { ok: false; error: string; status: number };

/** Place ambiguous Stream items on the category as unresolved marks (visible on tree). */
export async function commitAmbiguousItemsToCategory(
  userId: string,
  categoryId: string,
  limbId: string,
  items: AmbiguousItem[],
): Promise<{ created: number; committed: number; markIds: string[] }> {
  const markIds: string[] = [];
  let created = 0;
  let committed = 0;

  await prisma.$transaction(async (tx) => {
    const appendAnchor = { kind: "append" as const };
    const nextSequencePosition = async () => {
      const nodes = await loadCategorySequencedNodes(tx, categoryId);
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
              categoryId,
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
          categoryId,
          themeId: limbId,
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
    select: { id: true, categoryId: true, themeId: true, title: true, description: true },
  });
  if (!mark) {
    return { ok: false, error: "Unresolved mark not found", status: 404 };
  }
  return { ok: true, mark };
}

export async function moveUnresolvedMarkToCategory(
  userId: string,
  markId: string,
  targetCategoryId: string,
): Promise<AmbiguousMarkResult> {
  const current = await getUnresolvedAmbiguousMark(userId, markId);
  if (!current.ok) return current;
  const { mark } = current;

  if (mark.categoryId === targetCategoryId) {
    return { ok: true, mark };
  }

  const targetCategory = await prisma.themeCategory.findFirst({
    where: { id: targetCategoryId, userId },
    select: { id: true, themeId: true },
  });
  if (!targetCategory) {
    return { ok: false, error: "Target category not found", status: 400 };
  }

  let moved: UnresolvedAmbiguousMark | null = null;
  await prisma.$transaction(async (tx) => {
    const nodes = await loadCategorySequencedNodes(tx, targetCategory.id);
    const seqRes = resolveSequenceAnchor(nodes, { kind: "append" });
    await applySequenceResolution(tx, seqRes);

    moved = await tx.mark.update({
      where: { id: mark.id },
      data: {
        categoryId: targetCategory.id,
        themeId: targetCategory.themeId,
        sequencePosition: seqRes.sequencePosition,
      },
      select: { id: true, categoryId: true, themeId: true, title: true, description: true },
    });
  });

  return {
    ok: true,
    mark: moved ?? { ...mark, categoryId: targetCategory.id, themeId: targetCategory.themeId },
  };
}

/** @deprecated Use {@link commitAmbiguousItemsToCategory}. */
export const commitAmbiguousItemsToBranch = commitAmbiguousItemsToCategory;
/** @deprecated Use {@link moveUnresolvedMarkToCategory}. */
export const moveUnresolvedMarkToBranch = moveUnresolvedMarkToCategory;

export async function resolveAmbiguousMark(
  userId: string,
  markId: string,
  resolution: StreamAmbiguousResolution,
  targetCategoryId?: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const markResult = targetCategoryId
    ? await moveUnresolvedMarkToCategory(userId, markId, targetCategoryId)
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

  const lifeArea = getLifeArea(mark.themeId)?.label ?? "Other";
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;
  const markDescription = mark.description?.trim() || "";
  const { iconName, shortLabel } = await assignPursuitVisualsSafe({
    title: mark.title,
    description: markDescription,
    lifeArea,
    queueKey: userId,
  });

  await prisma.$transaction(async (tx) => {
    const appendAnchor = { kind: "append" as const };
    const nodes = await loadCategorySequencedNodes(tx, targetCategoryId ?? mark.categoryId);
    const seqRes = resolveSequenceAnchor(nodes, appendAnchor);
    await applySequenceResolution(tx, seqRes);

    await tx.goal.create({
      data: {
        userId,
        categoryId: mark.categoryId,
        themeId: mark.themeId,
        title: mark.title,
        description: markDescription,
        iconName,
        shortLabel,
        lifeArea,
        goalType: "project",
        status: "ACTIVE",
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
