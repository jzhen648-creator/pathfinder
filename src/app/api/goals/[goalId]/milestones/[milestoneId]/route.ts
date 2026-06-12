import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";

const patchBodySchema = z.union([
  z.object({ completed: z.boolean() }),
  z.object({
    completedAt: z.union([
      z
        .string()
        .min(1)
        .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid completedAt"),
      z.null(),
    ]),
  }),
  z.object({ position: z.number().int().nonnegative() }),
  z.object({ title: z.string().trim().min(1, "title is required") }),
]);

function resolveCompletedAt(body: z.infer<typeof patchBodySchema>): Date | null | undefined {
  if ("completed" in body) return body.completed ? new Date() : null;
  if ("completedAt" in body) return body.completedAt ? new Date(body.completedAt) : null;
  return undefined;
}

type RouteProps = { params: Promise<{ goalId: string; milestoneId: string }> };

const logPrefix = "[PATCH /api/goals/.../milestones/...]";

function isDevLike() {
  return process.env.NODE_ENV === "development";
}

/**
 * Explicit milestone completion (symbolic / tree-aligned). Subtasks remain optional depth.
 *
 * Diagnostics: set `PATHFINDER_SKIP_MILESTONE_PATCH_BLOOM_RECOMPUTE=1` to skip bloom recomputation
 * and isolate Prisma update-only failures (server logs still record phases).
 */
export async function PATCH(request: Request, props: RouteProps) {
  const skipBloomRecompute = process.env.PATHFINDER_SKIP_MILESTONE_PATCH_BLOOM_RECOMPUTE === "1";

  let rawBodyText = "";
  let goalId = "";
  let milestoneId = "";

  try {
    const auth = await requireApiSessionUserId();
    if (!auth.ok) {
      console.info(logPrefix, "early exit 401 unauthorized");
      return auth.response;
    }
    const userId = auth.userId;

    const params = await props.params;
    goalId = params.goalId;
    milestoneId = params.milestoneId;

    try {
      rawBodyText = await request.text();
    } catch (e) {
      console.error(logPrefix, "failed to read body text", e);
      return NextResponse.json({ error: "Could not read body" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = rawBodyText ? JSON.parse(rawBodyText) : {};
    } catch (e) {
      console.error(logPrefix, "JSON parse failed", { rawBodyText, error: e });
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    console.info(logPrefix, "incoming", {
      goalId,
      milestoneId,
      userId,
      skipBloomRecompute,
      rawBody: rawBodyText.slice(0, 500),
      parsedBody: body,
    });

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      console.warn(logPrefix, "validation failed", parsed.error.flatten());
      return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
    }

    const bodyData = parsed.data;
    const completedAt = resolveCompletedAt(bodyData);
    const position = "position" in bodyData ? bodyData.position : undefined;
    const title = "title" in bodyData ? bodyData.title : undefined;

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, goalId },
      include: {
        goal: { select: { id: true, userId: true, goalType: true } },
      },
    });

    console.info(logPrefix, "prefetch milestone", {
      found: Boolean(milestone),
      milestoneUserMatches: milestone ? milestone.goal.userId === userId : null,
      goalType: milestone?.goal.goalType,
    });

    if (!milestone || milestone.goal.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (milestone.goal.goalType === "moment" || milestone.goal.goalType === "event") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updateInput: { completedAt?: Date | null; position?: number; title?: string } = {};
    if (completedAt !== undefined) updateInput.completedAt = completedAt;
    if (position !== undefined) updateInput.position = position;
    if (title !== undefined) updateInput.title = title;

    if (Object.keys(updateInput).length === 0) {
      return NextResponse.json({ error: "No updatable fields in payload" }, { status: 400 });
    }

    console.info(logPrefix, "prisma.milestone.update input", {
      where: { id: milestoneId },
      data: updateInput,
    });

    let updated;
    try {
      updated = await prisma.milestone.update({
        where: { id: milestoneId },
        data: updateInput,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(logPrefix, "FAILED during prisma.milestone.update", {
        message: err.message,
        stack: err.stack,
        cause: err.cause,
      });
      throw Object.assign(err, { phase: "prisma.milestone.update" });
    }

    console.info(logPrefix, "prisma.milestone.update result", {
      id: updated.id,
      completedAt: updated.completedAt?.toISOString?.() ?? updated.completedAt,
      goalId: updated.goalId,
    });

    if (skipBloomRecompute) {
      console.warn(logPrefix, "SKIP recomputeGoalStatus (PATHFINDER_SKIP_MILESTONE_PATCH_BLOOM_RECOMPUTE=1)");
    } else {
      console.info(logPrefix, "recomputeGoalStatus enter", { goalId });
      try {
        await recomputeGoalStatus(goalId);
        console.info(logPrefix, "recomputeGoalStatus exit ok", { goalId });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error(logPrefix, "FAILED during recomputeGoalStatus", {
          goalId,
          message: err.message,
          stack: err.stack,
          cause: err.cause,
        });
        throw Object.assign(err, { phase: "recomputeGoalStatus" });
      }
    }

    const payload = { ok: true as const, skippedBloomRecompute: skipBloomRecompute };
    console.info(logPrefix, "success response", payload);
    await markPursuitReadingDirty(userId, goalId, "milestone_updated");
    return NextResponse.json(payload);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const phase = typeof (e as { phase?: string }).phase === "string" ? (e as { phase: string }).phase : "unknown";

    console.error(logPrefix, "UNHANDLED / outer catch", {
      phase,
      goalId,
      milestoneId,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });

    const bodyOut: Record<string, unknown> = {
      error: err.message || "Internal server error",
      phase,
    };
    if (isDevLike()) {
      bodyOut.stack = err.stack;
      bodyOut.name = err.name;
    }

    return NextResponse.json(bodyOut, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: RouteProps) {
  let goalId = "";
  let milestoneId = "";

  try {
    const auth = await requireApiSessionUserId();
    if (!auth.ok) {
      console.info(logPrefix, "early exit 401 unauthorized");
      return auth.response;
    }
    const userId = auth.userId;

    const params = await props.params;
    goalId = params.goalId;
    milestoneId = params.milestoneId;

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, goalId },
      include: {
        goal: { select: { id: true, userId: true, goalType: true } },
      },
    });

    if (!milestone || milestone.goal.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (milestone.goal.goalType === "moment" || milestone.goal.goalType === "event") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.milestone.delete({ where: { id: milestoneId } });
    await recomputeGoalStatus(goalId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(logPrefix, "DELETE failed", {
      goalId,
      milestoneId,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    });

    const bodyOut: Record<string, unknown> = {
      error: err.message || "Internal server error",
      phase: "delete",
    };
    if (isDevLike()) {
      bodyOut.stack = err.stack;
      bodyOut.name = err.name;
    }

    return NextResponse.json(bodyOut, { status: 500 });
  }
}
