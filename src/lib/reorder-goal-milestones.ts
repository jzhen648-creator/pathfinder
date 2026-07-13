import { prisma } from "@/lib/prisma";
import { goalAllowsStreamMilestones } from "@/lib/goal-type";

export function validateMilestoneReorder(
  existingIds: readonly string[],
  orderedIds: readonly string[],
): boolean {
  if (existingIds.length !== orderedIds.length) return false;
  if (orderedIds.length === 0) return true;
  if (new Set(orderedIds).size !== orderedIds.length) return false;
  const set = new Set(existingIds);
  if (set.size !== existingIds.length) return false;
  return orderedIds.every((id) => set.has(id));
}

type ReorderResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Reassign milestone positions in one transaction. Uses a negative intermediate
 * range to avoid @@unique([goalId, position]) collisions.
 */
export async function reorderMilestonesForGoal(
  goalId: string,
  userId: string,
  orderedIds: string[],
): Promise<ReorderResult> {
  const ids = orderedIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, error: "orderedIds must not be empty", status: 400 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({
        where: { id: goalId, userId },
        select: { id: true, goalType: true },
      });
      if (!goal) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      if (!goalAllowsStreamMilestones(goal)) {
        throw Object.assign(new Error("GOAL_TYPE"), { code: "GOAL_TYPE" });
      }

      const rows = await tx.milestone.findMany({
        where: { goalId },
        select: { id: true },
        orderBy: { position: "asc" },
      });
      const existingIds = rows.map((row) => row.id);
      if (!validateMilestoneReorder(existingIds, ids)) {
        throw Object.assign(new Error("INVALID_ORDER"), { code: "INVALID_ORDER" });
      }

      for (let index = 0; index < ids.length; index += 1) {
        await tx.milestone.update({
          where: { id: ids[index] },
          data: { position: -(index + 1) },
        });
      }
      for (let index = 0; index < ids.length; index += 1) {
        await tx.milestone.update({
          where: { id: ids[index] },
          data: { position: index },
        });
      }
    });

    return { ok: true };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : null;
    if (code === "NOT_FOUND") return { ok: false, error: "Not found", status: 404 };
    if (code === "GOAL_TYPE") return { ok: false, error: "Not found", status: 404 };
    if (code === "INVALID_ORDER") {
      return { ok: false, error: "orderedIds must match this chapter's milestones", status: 400 };
    }
    console.error("[reorderMilestonesForGoal]", e);
    return { ok: false, error: "Could not reorder milestones", status: 500 };
  }
}
