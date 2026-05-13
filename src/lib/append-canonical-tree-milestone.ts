import { prisma } from "@/lib/prisma";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { TREE_ORBITAL_MAX_VISIBLE } from "@/components/tree/milestone-tree-projection";

function maxMilestonePosition(milestones: { position: number }[]): number {
  return milestones.reduce((acc, m) => Math.max(acc, m.position), -1);
}

type AppendResult = { ok: true } | { ok: false; error: string; status: number };

/** Append one canonical `Milestone` from the tree panel (POST `/api/goals/[id]/milestones`). */
export async function appendCanonicalTreeMilestoneForGoal(
  goalId: string,
  userId: string,
  title: string,
): Promise<AppendResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Milestone title is required", status: 400 };

  try {
    await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({
        where: { id: goalId, userId },
        select: { id: true, goalType: true },
      });
      if (!goal) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      if (goal.goalType === "moment" || goal.goalType === "event") {
        throw Object.assign(new Error("GOAL_TYPE"), { code: "GOAL_TYPE" });
      }

      const rows = await tx.milestone.findMany({
        where: { goalId },
        orderBy: { position: "asc" },
        select: { position: true },
      });

      if (rows.length >= TREE_ORBITAL_MAX_VISIBLE) {
        throw Object.assign(new Error("MAX"), { code: "MAX" });
      }

      const insertPosition = maxMilestonePosition(rows) + 1;

      await tx.milestone.create({
        data: {
          goalId,
          title: trimmed,
          description: "",
          position: insertPosition,
        },
      });
    });

    await recomputeGoalBloomStatus(goalId);
    return { ok: true };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : null;
    if (code === "NOT_FOUND") return { ok: false, error: "Not found", status: 404 };
    if (code === "GOAL_TYPE") return { ok: false, error: "Not found", status: 404 };
    if (code === "MAX") {
      return { ok: false, error: `At most ${TREE_ORBITAL_MAX_VISIBLE} milestones on the tree`, status: 400 };
    }
    console.error("[appendCanonicalTreeMilestoneForGoal]", e);
    return { ok: false, error: "Could not add milestone", status: 500 };
  }
}
