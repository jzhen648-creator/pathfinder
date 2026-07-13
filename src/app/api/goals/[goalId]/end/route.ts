import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordPursuitStatusTransition } from "@/lib/pursuit/record-status-transition";
import { getGoalWithProgress } from "@/lib/roadmap";

const bodySchema = z.object({
  endReason: z.string().max(2000).optional(),
});

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, status: true, createdAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      status: "PAUSED",
      endedAt: new Date(),
      endReason: parsed.data.endReason?.trim() || null,
    },
  });

  await recordPursuitStatusTransition({
    userId,
    goalId,
    from: existing.status,
    to: "PAUSED",
    goalCreatedAt: existing.createdAt,
  });

  const goal = await getGoalWithProgress(goalId, userId);
  return NextResponse.json({ goal });
}
