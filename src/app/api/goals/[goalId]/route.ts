import { NextResponse, after } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import {
  clearReadingDirtyForPursuits,
  markPursuitReadingDirty,
} from "@/lib/map/reading-dirty-ledger";
import { buildFieldChanges } from "@/lib/map/reading-dirty-details";
import { resolvePursuitStatusFromBody } from "@/lib/pursuit-status-api";
import { prisma } from "@/lib/prisma";
import { updateGoalPayloadSchema } from "@/lib/validation/update-goal";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { goalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const resolvedStatus = resolvePursuitStatusFromBody(raw);
  const parsed = updateGoalPayloadSchema.safeParse({
    ...raw,
    ...(resolvedStatus
      ? {
          status: raw.status ?? resolvedStatus,
          bloomStatus: raw.bloomStatus ?? resolvedStatus,
        }
      : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      goalType: true,
      title: true,
      status: true,
      deadline: true,
      significance: true,
      archived: true,
      completedAt: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.goalType === "moment" || existing.goalType === "event") {
    return NextResponse.json({ error: "Timeline marks use a different editor" }, { status: 400 });
  }

  const input = parsed.data;
  const titleChanged =
    input.title !== undefined &&
    input.title.trim().length > 0 &&
    input.title.trim() !== existing.title.trim();
  const data: {
    title?: string;
    description?: string;
    significance?: number;
    timelineStart?: Date | null;
    deadline?: Date | null;
    year?: number;
    month?: number | null;
    future?: boolean;
    archived?: boolean;
    status?: "ACTIVE" | "PAUSED" | "COMPLETE" | "MAINTAINING" | "ABANDONED";
    completedAt?: Date | null;
    endedAt?: Date | null;
    endReason?: string | null;
    mapGridQ?: number | null;
    mapGridR?: number | null;
    iconName?: string | null;
  } = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.significance !== undefined) {
    data.significance = Math.min(5, Math.max(1, Math.round(input.significance)));
  }
  if (input.timelineStart !== undefined) {
    data.timelineStart =
      input.timelineStart === null
        ? null
        : new Date(`${input.timelineStart}T00:00:00.000Z`);
  }
  if (input.deadline !== undefined) {
    if (input.deadline === null) {
      data.deadline = null;
    } else {
      const deadline = new Date(`${input.deadline}T00:00:00.000Z`);
      data.deadline = deadline;
      data.year = deadline.getUTCFullYear();
      data.month = deadline.getUTCMonth() + 1;
      data.future = deadline.getTime() > Date.now();
    }
  }
  if (input.archived !== undefined) data.archived = input.archived;
  if (input.mapGridQ !== undefined) data.mapGridQ = input.mapGridQ;
  if (input.mapGridR !== undefined) data.mapGridR = input.mapGridR;
  if (input.iconName !== undefined) {
    data.iconName =
      input.iconName == null ? null : input.iconName.trim().toLowerCase() || null;
  }
  if (input.completedAt !== undefined) {
    data.completedAt = new Date(`${input.completedAt}T00:00:00.000Z`);
  }

  const pursuitStatus = input.status ?? input.bloomStatus;
  if (pursuitStatus !== undefined) {
    data.status = pursuitStatus;
    if (pursuitStatus === "PAUSED" || pursuitStatus === "ABANDONED") {
      data.endedAt = new Date();
    } else if (pursuitStatus === "COMPLETE") {
      if (input.completedAt === undefined) {
        data.completedAt = new Date();
      }
      data.endedAt = null;
      data.endReason = null;
    } else {
      data.endedAt = null;
      data.endReason = null;
      data.completedAt = null;
    }
  }

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data,
    select: {
      id: true,
      title: true,
      description: true,
      significance: true,
      categoryId: true,
      goalType: true,
      status: true,
      iconName: true,
      completedAt: true,
    },
  });

  if (titleChanged) {
    after(() => {
      void persistGoalShortLabel(goalId).catch((err) =>
        console.error("[PATCH /api/goals/[goalId]] persistGoalShortLabel failed", err),
      );
    });
  }

  const dirtyUpdates: Record<string, unknown> = {};
  if (input.title !== undefined) dirtyUpdates.title = data.title;
  if (pursuitStatus !== undefined) dirtyUpdates.status = data.status;
  if (input.deadline !== undefined) {
    dirtyUpdates.deadline = data.deadline ? data.deadline.toISOString().slice(0, 10) : null;
  }
  if (input.significance !== undefined) dirtyUpdates.significance = data.significance;
  if (input.completedAt !== undefined || pursuitStatus === "COMPLETE") {
    dirtyUpdates.completedAt = goal.completedAt
      ? goal.completedAt.toISOString().slice(0, 10)
      : null;
  }

  const changes = buildFieldChanges(
    {
      ...existing,
      completedAt: existing.completedAt
        ? existing.completedAt.toISOString().slice(0, 10)
        : null,
    },
    dirtyUpdates,
    ["title", "status", "deadline", "significance", "completedAt"],
  );

  const restored = input.archived === false && existing.archived === true;
  if (restored) {
    await clearReadingDirtyForPursuits(userId, [goal.id]);
    await markPursuitReadingDirty(userId, goal.id, "pursuit_restored", {
      details: { event: "restored", title: goal.title },
    });
  } else {
    await markPursuitReadingDirty(userId, goal.id, "pursuit_updated", {
      details: changes.length > 0 ? { changes, title: goal.title } : { title: goal.title },
    });
  }

  return NextResponse.json({ goal });
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { goalId } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, title: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.update({
    where: { id: goalId },
    data: { archived: true },
  });

  await markPursuitReadingDirty(userId, goalId, "pursuit_archived", {
    details: { event: "archived", title: existing.title },
  });

  return NextResponse.json({ ok: true });
}
