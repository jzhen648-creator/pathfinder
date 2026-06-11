import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      bloomStatus: "PAUSED",
      endedAt: new Date(),
      endReason: parsed.data.endReason?.trim() || null,
    },
  });

  const goal = await getGoalWithProgress(goalId, userId);
  return NextResponse.json({ goal });
}
