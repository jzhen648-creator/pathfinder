import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateGoalPayloadSchema } from "@/lib/validation/update-goal";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

function resolveUserId(sessionUserId: string, request: Request): string {
  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  return process.env.NODE_ENV === "development" && requestedUserId
    ? requestedUserId
    : sessionUserId;
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = resolveUserId(sessionUserId, request);
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
    select: { id: true, goalType: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.goalType === "moment" || existing.goalType === "event") {
    return NextResponse.json({ error: "Timeline moments use a different editor" }, { status: 400 });
  }

  const input = parsed.data;
  const data: {
    title?: string;
    description?: string;
    significance?: number;
  } = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.significance !== undefined) {
    data.significance = Math.min(5, Math.max(1, Math.round(input.significance)));
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

  return NextResponse.json({ goal });
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = resolveUserId(sessionUserId, request);

  const { goalId } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.delete({ where: { id: goalId } });
  return NextResponse.json({ ok: true });
}
