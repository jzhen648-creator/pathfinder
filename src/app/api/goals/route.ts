import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { getLifeArea } from "@/lib/life-areas";
import {
  buildFallbackRoadmap,
  generateGoalRoadmap,
  RoadmapGenerationError,
} from "@/lib/milestone-generator";
import { persistGeneratedRoadmapForGoal } from "@/lib/persist-generated-roadmap";
import { prisma } from "@/lib/prisma";
import {
  createGoalPayloadSchema,
  deadlineIsInFutureLocal,
  parseLocalDateOnly,
} from "@/lib/validation/create-goal";

function redirectToMoments(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/marks";
  return NextResponse.redirect(url, 308);
}

export async function GET(request: Request) {
  return redirectToMoments(request);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  const userId =
    process.env.NODE_ENV === "development" && requestedUserId
      ? requestedUserId
      : sessionUserId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = createGoalPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const branchRecord = await prisma.branch.findFirst({
    where: { id: input.branchId.trim(), userId },
    select: { id: true, limbId: true, name: true, label: true },
  });
  if (!branchRecord) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const title = input.title.trim();
  const description = input.description.trim();

  let deadline: Date | null = null;
  if (input.goalType === "project" && input.deadline.trim()) {
    deadline = parseLocalDateOnly(input.deadline.trim());
    if (!deadline) {
      return NextResponse.json({ error: "Invalid deadline date" }, { status: 400 });
    }
  }

  const future = deadline ? deadlineIsInFutureLocal(deadline) : true;

  const now = new Date();
  const year = deadline ? deadline.getFullYear() : now.getFullYear();
  const month = deadline ? deadline.getMonth() + 1 : now.getMonth() + 1;

  const measurable = input.hasMeasurableTarget;
  const targetNum = measurable ? Number(input.targetAmount) : NaN;
  if (measurable && (!Number.isFinite(targetNum) || targetNum <= 0)) {
    return NextResponse.json({ error: "Target amount must be a positive number" }, { status: 400 });
  }
  let currentNum = measurable ? Number(input.currentAmount) : null;
  if (measurable) {
    if (!Number.isFinite(currentNum) || (currentNum ?? 0) < 0) {
      currentNum = 0;
    }
  }

  const unit = measurable && input.unit.trim().length > 0 ? input.unit.trim() : null;
  const lifeArea = getLifeArea(branchRecord.limbId)?.label ?? "Other";

  const sigRaw = Number(input.significance);
  const significance = Number.isFinite(sigRaw)
    ? Math.min(5, Math.max(1, Math.round(sigRaw)))
    : 3;

  try {
    const goal = await prisma.goal.create({
      data: {
        userId,
        title,
        description,
        lifeArea,
        goalType: input.goalType,
        branchId: branchRecord.id,
        limbId: branchRecord.limbId,
        deadline,
        significance,
        bloomStatus: "BUD",
        aiGenerated: false,
        future,
        year,
        month,
        // Only send measurement fields when used. Omitting avoids "Unknown argument `unit`"
        // if @prisma/client is behind schema (e.g. generate failed while dev server had DLL locked).
        ...(measurable
          ? {
              targetAmount: targetNum,
              currentAmount: currentNum,
              ...(unit ? { unit } : {}),
            }
          : {}),
      },
    });

    try {
      await recomputeGoalBloomStatus(goal.id);
    } catch (recErr) {
      console.error("[POST /api/goals] recomputeGoalBloomStatus failed", recErr);
    }

    if (input.generateRoadmap) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingProfileText: true },
      });
      const deadlineStr = deadline ? deadline.toISOString().slice(0, 10) : "No fixed deadline";
      const roadmapInput = {
        title,
        description: description || title,
        lifeArea,
        startingPoint: "Starting from where I am now",
        biggestObstacle: "Time and consistency",
        hoursPerWeek: "A few hours per week",
        deadline: deadlineStr,
        profileContext: user?.onboardingProfileText ?? undefined,
      };
      let roadmap;
      try {
        roadmap = await generateGoalRoadmap(roadmapInput);
      } catch (err) {
        if (err instanceof RoadmapGenerationError) {
          roadmap = buildFallbackRoadmap(roadmapInput);
        } else {
          console.error("[POST /api/goals] generateRoadmap failed", err);
        }
      }
      if (roadmap) {
        const persisted = await persistGeneratedRoadmapForGoal(goal.id, userId, roadmap);
        if (!persisted.ok) {
          console.error("[POST /api/goals] persistGeneratedRoadmap failed", persisted.error);
        }
      }
    }

    const branchLabel = branchRecord.name ?? branchRecord.label ?? "Branch";

    return NextResponse.json(
      {
        goal: { id: goal.id, title: goal.title },
        branchLabel,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/goals] create failed", err);
    const isDev = process.env.NODE_ENV === "development";
    let message = "Could not create goal";
    if (isDev) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        message = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        message = err.message;
      } else {
        message = String(err);
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
