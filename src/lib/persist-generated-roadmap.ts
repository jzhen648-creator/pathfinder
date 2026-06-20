import type { GeneratedRoadmap } from "@/lib/milestone-generator";
import { prisma } from "@/lib/prisma";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";

type PersistResult = { ok: true } | { ok: false; error: string; status: number };

/** Replace relational milestones for a goal with an AI-generated roadmap (milestones only). */
export async function persistGeneratedRoadmapForGoal(
  goalId: string,
  userId: string,
  roadmap: GeneratedRoadmap,
): Promise<PersistResult> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, goalType: true },
  });
  if (!goal) return { ok: false, error: "Not found", status: 404 };
  if (goal.goalType === "moment" || goal.goalType === "event") {
    return { ok: false, error: "Not found", status: 404 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany({ where: { goalId } });

      for (let mi = 0; mi < roadmap.milestones.length; mi += 1) {
        const m = roadmap.milestones[mi]!;
        await tx.milestone.create({
          data: {
            goalId,
            title: m.title.trim(),
            description: m.description.trim(),
            position: mi,
          },
        });
      }

      await tx.goal.update({
        where: { id: goalId },
        data: {
          aiGenerated: true,
          ...(roadmap.goalType === "outcome" && roadmap.finance?.targetAmount != null
            ? { targetAmount: roadmap.finance.targetAmount }
            : {}),
        },
      });
    });

    await recomputeGoalStatus(goalId);
    return { ok: true };
  } catch (err) {
    console.error("[persistGeneratedRoadmapForGoal]", err);
    return { ok: false, error: "Could not persist roadmap", status: 500 };
  }
}
