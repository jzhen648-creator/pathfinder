import type { Prisma } from "@prisma/client";
import { getLifeArea } from "@/lib/life-areas";
import { prisma } from "@/lib/prisma";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
  type SequenceAnchor,
} from "@/lib/branch-sequence";
import type { GoalReorganizeBody } from "@/lib/validation/goal-reorganize";

import { TREE_GOAL_MAX_CHILDREN_PER_NODE } from "@/components/tree/tree-view-constants";

async function collectDescendantGoalIds(
  tx: Prisma.TransactionClient,
  rootGoalId: string,
): Promise<string[]> {
  const rows = await tx.goal.findMany({
    where: { archived: false },
    select: { id: true, parentGoalId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentGoalId) continue;
    const list = byParent.get(row.parentGoalId) ?? [];
    list.push(row.id);
    byParent.set(row.parentGoalId, list);
  }
  const out: string[] = [];
  const stack = [...(byParent.get(rootGoalId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.push(id);
    const kids = byParent.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

function wouldCreateCycle(
  goalId: string,
  newParentId: string,
  parentById: Map<string, string | null>,
): boolean {
  if (goalId === newParentId) return true;
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === goalId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentById.get(cur) ?? null;
  }
  return false;
}

export async function reorganizeGoalForUser(
  userId: string,
  goalId: string,
  body: GoalReorganizeBody,
): Promise<{ ok: true }> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, archived: false },
    select: {
      id: true,
      categoryId: true,
      limbId: true,
      parentGoalId: true,
    },
  });
  if (!goal) throw new ReorganizeError("Goal not found", 404);

  if (body.op === "moveToHub") {
    const branch = await prisma.themeCategory.findFirst({
      where: { id: body.categoryId, userId },
      select: { id: true, limbId: true },
    });
    if (!branch) throw new ReorganizeError("Branch not found", 404);

    const anchor: SequenceAnchor = body.sequenceAnchor ?? { kind: "append" };
    const lifeArea = getLifeArea(branch.limbId)?.label ?? branch.limbId;

    await prisma.$transaction(async (tx) => {
      const nodes = await loadBranchSequencedNodes(tx, branch.id);
      const resolution = resolveSequenceAnchor(nodes, anchor);
      await applySequenceResolution(tx, resolution);

      await tx.goal.update({
        where: { id: goalId },
        data: {
          categoryId: branch.id,
          limbId: branch.limbId,
          lifeArea,
          parentGoalId: null,
          sequencePosition: resolution.sequencePosition,
        },
      });

      const descendantIds = await collectDescendantGoalIds(tx, goalId);
      if (descendantIds.length > 0) {
        await tx.goal.updateMany({
          where: { id: { in: descendantIds } },
          data: { categoryId: branch.id, limbId: branch.limbId, lifeArea },
        });
      }
    });
    return { ok: true };
  }

  const parent = await prisma.goal.findFirst({
    where: { id: body.parentGoalId, userId, archived: false },
    select: { id: true, categoryId: true, limbId: true, parentGoalId: true },
  });
  if (!parent) throw new ReorganizeError("Parent pursuit not found", 404);
  if (goal.limbId && parent.limbId && parent.limbId !== goal.limbId) {
    throw new ReorganizeError("Pursuits can only be nested within the same theme", 400);
  }

  const siblings = await prisma.goal.count({
    where: { parentGoalId: body.parentGoalId, archived: false, id: { not: goalId } },
  });
  if (siblings >= TREE_GOAL_MAX_CHILDREN_PER_NODE) {
    throw new ReorganizeError(
      `A pursuit can have at most ${TREE_GOAL_MAX_CHILDREN_PER_NODE} nested pursuits`,
      400,
    );
  }

  const parentRows = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: { id: true, parentGoalId: true },
  });
  const parentById = new Map(parentRows.map((r) => [r.id, r.parentGoalId]));
  if (wouldCreateCycle(goalId, body.parentGoalId, parentById)) {
    throw new ReorganizeError("Cannot nest a pursuit under itself or its descendants", 400);
  }

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      parentGoalId: body.parentGoalId,
      sequencePosition: null,
      categoryId: parent.categoryId,
      limbId: parent.limbId,
    },
  });

  const descendantIds = await collectDescendantGoalIds(prisma, goalId);
  if (descendantIds.length > 0 && parent.categoryId) {
    await prisma.goal.updateMany({
      where: { id: { in: descendantIds } },
      data: { categoryId: parent.categoryId, limbId: parent.limbId },
    });
  }

  return { ok: true };
}

export class ReorganizeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReorganizeError";
  }
}
