import type { Prisma } from "@prisma/client";
import type { GeneratedRoadmap } from "@/lib/milestone-generator";
import { prisma } from "@/lib/prisma";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";

type PersistResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Replace relational milestones for a goal with an AI-generated roadmap.
 * Clears existing `Milestone` rows (cascade deletes subtasks / daily tasks / checkpoints).
 */
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

  const roadmapJson = roadmap as unknown as Prisma.InputJsonValue;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany({ where: { goalId } });

      for (let mi = 0; mi < roadmap.milestones.length; mi += 1) {
        const m = roadmap.milestones[mi]!;
        const milestone = await tx.milestone.create({
          data: {
            goalId,
            title: m.title.trim(),
            description: m.description.trim(),
            position: mi,
          },
        });

        for (let qi = 0; qi < m.quickWins.length; qi += 1) {
          const qw = m.quickWins[qi]!;
          const subtask = await tx.subtask.create({
            data: {
              milestoneId: milestone.id,
              title: qw.title.trim(),
              position: qi,
            },
          });

          if (roadmap.goalType === "action" && "dailyTasks" in qw && Array.isArray(qw.dailyTasks)) {
            for (let di = 0; di < qw.dailyTasks.length; di += 1) {
              const dt = qw.dailyTasks[di]!;
              await tx.dailyTask.create({
                data: {
                  quickWinId: subtask.id,
                  title: dt.title.trim(),
                  position: di,
                },
              });
            }
          }

          if (roadmap.goalType === "outcome" && "checkpoints" in qw && Array.isArray(qw.checkpoints)) {
            for (let ci = 0; ci < qw.checkpoints.length; ci += 1) {
              const cp = qw.checkpoints[ci]!;
              await tx.checkpoint.create({
                data: {
                  quickWinId: subtask.id,
                  title: cp.title.trim(),
                  position: ci,
                },
              });
            }
          }
        }
      }

      await tx.goal.update({
        where: { id: goalId },
        data: {
          roadmapJson,
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
