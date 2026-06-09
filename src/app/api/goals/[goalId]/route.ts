import { NextResponse, after } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import { refreshInsightsInBackground } from "@/lib/insights/refresh-insights-background";
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

  const parsed = updateGoalPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, goalType: true, title: true },
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
    bloomStatus?: "ACTIVE" | "ON_HOLD" | "COMPLETE" | "MAINTAINING";
    bloomedAt?: Date | null;
    endedAt?: Date | null;
    endReason?: string | null;
    mapGridQ?: number | null;
    mapGridR?: number | null;
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

  if (input.bloomStatus !== undefined) {
    data.bloomStatus = input.bloomStatus;
    if (input.bloomStatus === "ON_HOLD") {
      data.endedAt = new Date();
    } else if (input.bloomStatus === "COMPLETE") {
      data.bloomedAt = new Date();
      data.endedAt = null;
      data.endReason = null;
    } else {
      data.endedAt = null;
      data.endReason = null;
      data.bloomedAt = null;
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
      branchId: true,
      goalType: true,
      bloomStatus: true,
    },
  });

  if (titleChanged) {
    after(() => {
      void persistGoalShortLabel(goalId).catch((err) =>
        console.error("[PATCH /api/goals/[goalId]] persistGoalShortLabel failed", err),
      );
    });
  }

  refreshInsightsInBackground(userId);

  return NextResponse.json({ goal });
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { goalId } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.update({
    where: { id: goalId },
    data: { archived: true },
  });

  refreshInsightsInBackground(userId);

  return NextResponse.json({ ok: true });
}
