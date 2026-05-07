import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { prisma } from "@/lib/prisma";
import { getGoalWithProgress } from "@/lib/roadmap";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  /** ISO date string; defaults to parent deadline when omitted. */
  deadline: z.string().optional(),
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
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const parent = await prisma.goal.findFirst({
    where: { id: goalId, userId },
  });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deadline =
    parsed.data.deadline && !Number.isNaN(Date.parse(parsed.data.deadline))
      ? new Date(parsed.data.deadline)
      : parent.deadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const child = await prisma.goal.create({
    data: {
      userId,
      title: parsed.data.title.trim(),
      description: (parsed.data.description ?? parent.description).trim(),
      lifeArea: parent.lifeArea,
      goalType: parent.goalType,
      targetAmount: parent.targetAmount,
      currentAmount: parent.currentAmount,
      deadline,
      branchId: parent.branchId,
      parentGoalId: parent.id,
      aiGenerated: false,
      bloomStatus: "BUD",
    },
  });

  await recomputeGoalBloomStatus(parent.id);

  const goal = await getGoalWithProgress(child.id, userId);
  return NextResponse.json({ goal }, { status: 201 });
}
