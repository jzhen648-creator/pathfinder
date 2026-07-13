import type { PursuitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planStatusTransition } from "@/lib/pursuit/status-transition-planner";

/**
 * Best-effort status-history recorder. Call AFTER the goal-row write commits —
 * history must never fail or roll back the user's primary write, so errors
 * are logged and swallowed (same posture as post-write recompute).
 */
export async function recordPursuitStatusTransition(input: {
  userId: string;
  goalId: string;
  from: PursuitStatus | string;
  to: PursuitStatus | string;
  goalCreatedAt: Date;
  now?: number;
}): Promise<void> {
  const { userId, goalId, goalCreatedAt } = input;
  const from = input.from as PursuitStatus;
  const to = input.to as PursuitStatus;

  try {
    const last = await prisma.pursuitStatusTransition.findFirst({
      where: { goalId },
      orderBy: { at: "desc" },
      select: { id: true, fromStatus: true, toStatus: true, at: true },
    });

    const plan = planStatusTransition({
      from,
      to,
      goalCreatedAt,
      last,
      now: input.now,
    });

    if (plan.action === "skip") return;
    if (plan.action === "deleteLast") {
      await prisma.pursuitStatusTransition.delete({ where: { id: plan.lastId } });
      return;
    }
    if (plan.action === "collapseLast") {
      await prisma.pursuitStatusTransition.update({
        where: { id: plan.lastId },
        data: { toStatus: to },
      });
      return;
    }
    await prisma.pursuitStatusTransition.create({
      data: { userId, goalId, fromStatus: from, toStatus: to },
    });
  } catch (err) {
    console.error("[recordPursuitStatusTransition] failed (history only, write unaffected)", {
      goalId,
      from,
      to,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
