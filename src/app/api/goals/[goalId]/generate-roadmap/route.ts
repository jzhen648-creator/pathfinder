import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildFallbackRoadmap,
  generateGoalRoadmap,
  RoadmapGenerationError,
} from "@/lib/milestone-generator";
import { persistGeneratedRoadmapForGoal } from "@/lib/persist-generated-roadmap";

type RouteProps = { params: Promise<{ goalId: string }> };

const bodySchema = z
  .object({
    startingPoint: z.string().optional(),
    biggestObstacle: z.string().optional(),
    hoursPerWeek: z.string().optional(),
  })
  .strict();

export async function POST(request: Request, props: RouteProps) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  const userId =
    process.env.NODE_ENV === "development" && requestedUserId ? requestedUserId : sessionUserId;

  const { goalId } = await props.params;

  let body: z.infer<typeof bodySchema> = {};
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    // Empty body is fine — discovery fields default below.
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      lifeArea: true,
      goalType: true,
      deadline: true,
      milestones: { select: { id: true }, take: 1 },
    },
  });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (goal.goalType === "moment" || goal.goalType === "event") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (goal.milestones.length > 0) {
    return NextResponse.json({ error: "Goal already has milestones" }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingProfileText: true },
  });

  const deadlineStr = goal.deadline
    ? goal.deadline.toISOString().slice(0, 10)
    : "No fixed deadline";

  const roadmapInput = {
    title: goal.title,
    description: goal.description?.trim() || goal.title,
    lifeArea: goal.lifeArea,
    startingPoint: body.startingPoint?.trim() || "Starting from where I am now",
    biggestObstacle: body.biggestObstacle?.trim() || "Time and consistency",
    hoursPerWeek: body.hoursPerWeek?.trim() || "A few hours per week",
    deadline: deadlineStr,
    profileContext: user?.onboardingProfileText ?? undefined,
  };

  let roadmap;
  let usedFallback = false;
  try {
    roadmap = await generateGoalRoadmap(roadmapInput);
  } catch (err) {
    if (err instanceof RoadmapGenerationError) {
      roadmap = buildFallbackRoadmap(roadmapInput);
      usedFallback = true;
    } else {
      console.error("[POST generate-roadmap]", err);
      return NextResponse.json({ error: "Roadmap generation failed" }, { status: 502 });
    }
  }

  const persisted = await persistGeneratedRoadmapForGoal(goalId, userId, roadmap);
  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: persisted.status });
  }

  return NextResponse.json({
    ok: true,
    milestoneCount: roadmap.milestones.length,
    usedFallback,
  });
}
