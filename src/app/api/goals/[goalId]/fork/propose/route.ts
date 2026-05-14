import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import {
  evolveProposalSchema,
  generateEvolveProposal,
  roadmapFromEvolveProposal,
} from "@/lib/evolve-goal-proposal";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  whatsDifferent: z.string().max(4000).optional(),
  correction: z.string().max(4000).optional(),
  previousProposal: evolveProposalSchema.optional(),
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
        select: { title: true, completedAt: true },
      },
    },
  });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recomputeGoalBloomStatus(parent.id);
  const refreshed = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { bloomStatus: true },
  });
  if (!refreshed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (refreshed.bloomStatus !== "BLOOMED") {
    return NextResponse.json(
      { error: "Complete this goal before evolving it." },
      { status: 409 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingProfileText: true },
  });

  const { proposal, usedFallback } = await generateEvolveProposal({
    parentTitle: parent.title,
    parentDescription: parent.description ?? "",
    parentLifeArea: parent.lifeArea,
    completedMilestoneTitles: parent.milestones
      .filter((m) => m.completedAt != null)
      .map((m) => m.title),
    whatsDifferent: parsed.data.whatsDifferent,
    correction: parsed.data.correction,
    previousProposal: parsed.data.previousProposal,
    profileContext: user?.onboardingProfileText ?? undefined,
  });

  const roadmapPreview = roadmapFromEvolveProposal(proposal, parent.lifeArea);

  return NextResponse.json({ proposal, roadmapPreview, usedFallback });
}
