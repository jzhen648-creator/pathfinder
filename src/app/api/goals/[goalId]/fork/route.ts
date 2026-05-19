import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { evolveProposalSchema, roadmapFromEvolveProposal } from "@/lib/evolve-goal-proposal";
import { recomputeGoalBloomStatus, tryRecomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { persistGeneratedRoadmapForGoal } from "@/lib/persist-generated-roadmap";
import { prisma } from "@/lib/prisma";
import { getGoalWithProgress } from "@/lib/roadmap";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  /** ISO date string; defaults to parent deadline when omitted. */
  deadline: z.string().optional(),
  /** When set, relational milestones are written from the approved evolve proposal. */
  proposal: evolveProposalSchema.optional(),
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
    include: {
      milestones: {
        orderBy: { position: "asc" },
        include: { subtasks: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recomputeGoalBloomStatus(parent.id);
  const refreshed = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      bloomStatus: true,
      goalType: true,
      description: true,
      lifeArea: true,
      targetAmount: true,
      currentAmount: true,
      deadline: true,
      branchId: true,
    },
  });
  if (!refreshed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (refreshed.bloomStatus !== "BLOOMED") {
    return NextResponse.json(
      { error: "Complete this goal before starting a continuation." },
      { status: 409 },
    );
  }

  const deadline =
    parsed.data.deadline && !Number.isNaN(Date.parse(parsed.data.deadline))
      ? new Date(parsed.data.deadline)
      : parsed.data.proposal?.targetDate && !Number.isNaN(Date.parse(parsed.data.proposal.targetDate))
        ? new Date(parsed.data.proposal.targetDate)
      : refreshed.deadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const child = await prisma.goal.create({
    data: {
      userId,
      title: parsed.data.title.trim(),
      description: (
        parsed.data.description ??
        parsed.data.proposal?.description ??
        refreshed.description ??
        ""
      ).trim(),
      lifeArea: refreshed.lifeArea,
      goalType: refreshed.goalType,
      targetAmount: refreshed.targetAmount,
      currentAmount: refreshed.currentAmount,
      deadline,
      branchId: refreshed.branchId,
      parentGoalId: parent.id,
      aiGenerated: false,
      bloomStatus: "BUD",
    },
  });

  // Parent lifecycle unchanged by fork in practice; harmless refresh if milestones ever move.
  // TODO(stabilization): ensure any future fork-copy of milestones triggers recompute on both goals.
  await tryRecomputeGoalBloomStatus(parent.id, "POST /api/goals/[goalId]/fork parent refresh");

  if (parsed.data.proposal) {
    const roadmap = roadmapFromEvolveProposal(parsed.data.proposal, refreshed.lifeArea);
    const persisted = await persistGeneratedRoadmapForGoal(child.id, userId, roadmap);
    if (!persisted.ok) {
      await prisma.goal.delete({ where: { id: child.id } });
      return NextResponse.json({ error: persisted.error }, { status: persisted.status });
    }
  }

  const goal = await getGoalWithProgress(child.id, userId);
  return NextResponse.json({ goal }, { status: 201 });
}
