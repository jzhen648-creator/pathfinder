import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";
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
import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import { activateCategoryForUser } from "@/lib/system-categories";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { isLifeAreaId, unlockThemesForUser } from "@/lib/unlocked-themes";
import { appendPursuitContextEntryAndSync } from "@/lib/pursuit/pursuit-context-log";
import { createPursuitRelationshipForUser } from "@/lib/pursuit/apply-pursuit-relationship";
import { persistGoalShortLabel } from "@/lib/goal-short-label";

function shouldGenerateRoadmap(requested: boolean | undefined): boolean {
  if (!requested) return false;
  if (process.env.NODE_ENV !== "development") return true;
  return process.env.ENABLE_AI_ROADMAPS_IN_DEV?.trim().toLowerCase() === "true";
}

export async function GET() {
  return NextResponse.json(
    { error: "Listing goals via GET is retired. Use GET /api/map-data." },
    { status: 410 },
  );
}

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

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
  const createdFromGoalId =
    typeof input.createdFromGoalId === "string" && input.createdFromGoalId.trim().length > 0
      ? input.createdFromGoalId.trim()
      : null;

  if (createdFromGoalId) {
    const sourceGoal = await prisma.goal.findFirst({
      where: { id: createdFromGoalId, userId, archived: false },
      select: { id: true },
    });
    if (!sourceGoal) {
      return NextResponse.json({ error: "Source pursuit not found" }, { status: 400 });
    }
  }

  const branchRecord = await prisma.themeCategory.findFirst({
    where: { id: input.categoryId.trim(), userId },
    select: { id: true, themeId: true, label: true, isActive: true },
  });
  if (!branchRecord) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  if (!branchRecord.isActive) {
    await activateCategoryForUser(prisma, userId, branchRecord.id);
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

  let timelineStart: Date | null = null;
  const timelineStartTrim = input.timelineStart?.trim() ?? "";
  if (timelineStartTrim.length > 0) {
    timelineStart = parseLocalDateOnly(timelineStartTrim);
    if (!timelineStart) {
      return NextResponse.json({ error: "Invalid timelineStart date" }, { status: 400 });
    }
  }

  let completedAt: Date | null = null;
  const completedAtTrim = input.completedAt?.trim() ?? "";
  if (completedAtTrim.length > 0) {
    completedAt = parseLocalDateOnly(completedAtTrim);
    if (!completedAt) {
      return NextResponse.json({ error: "Invalid completedAt date" }, { status: 400 });
    }
  }

  const future = deadline ? deadlineIsInFutureLocal(deadline) : true;

  const now = new Date();
  const year = deadline ? deadline.getFullYear() : now.getFullYear();
  const month = deadline ? deadline.getMonth() + 1 : now.getMonth() + 1;

  const measurable = input.hasMeasurableTarget;
  const targetNum = measurable ? Number(input.targetAmount) : NaN;
  const targetValid = measurable && Number.isFinite(targetNum) && targetNum > 0;
  let currentNum = measurable ? Number(input.currentAmount) : null;
  if (measurable) {
    const currentValid = Number.isFinite(currentNum) && (currentNum ?? 0) > 0;
    if (!targetValid && !currentValid) {
      return NextResponse.json(
        { error: "Enter a positive target or current amount" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(currentNum) || (currentNum ?? 0) < 0) {
      currentNum = targetValid ? 0 : null;
    }
  }

  const unit = measurable && input.unit.trim().length > 0 ? input.unit.trim() : null;
  const amountBasisTrim = input.amountBasis?.trim() ?? "";
  const amountBasis =
    measurable && (amountBasisTrim === "gross" || amountBasisTrim === "net")
      ? amountBasisTrim
      : null;
  const lifeArea = getLifeArea(branchRecord.themeId)?.label ?? "Other";

  let significance: number | null = null;
  if (input.significance != null) {
    const sigRaw = Number(input.significance);
    if (Number.isFinite(sigRaw)) {
      significance = Math.min(5, Math.max(1, Math.round(sigRaw)));
    }
  }

  try {
    const anchor = input.anchor ?? { kind: "append" as const };
    const existingNodes = await loadCategorySequencedNodes(prisma, branchRecord.id);
    const resolution = resolveSequenceAnchor(existingNodes, anchor);
    const sequencePosition = resolution.sequencePosition;

    const goal = await prisma.$transaction(async (tx) => {
      await applySequenceResolution(tx, resolution);
      return tx.goal.create({
        data: {
          userId,
          title,
          description: description || "",
          iconName: null,
          lifeArea,
          goalType: input.goalType,
          categoryId: branchRecord.id,
          themeId: branchRecord.themeId,
          deadline,
          significance,
          status: input.status ?? "ACTIVE",
          aiGenerated: false,
          future,
          year,
          month,
          sequencePosition,
          createdFromGoalId,
          ...(measurable
            ? {
                ...(targetValid ? { targetAmount: targetNum } : {}),
                ...(currentNum != null && currentNum > 0 ? { currentAmount: currentNum } : {}),
                ...(unit ? { unit } : {}),
                ...(amountBasis ? { amountBasis } : {}),
              }
            : {}),
          ...(input.mapGridQ !== undefined && input.mapGridR !== undefined
            ? { mapGridQ: input.mapGridQ, mapGridR: input.mapGridR }
            : {}),
          ...(timelineStart ? { timelineStart } : {}),
          ...(completedAt ? { completedAt } : {}),
        },
      });
    });

    if (description) {
      // Retired pending post-TestFlight cleanup — no live readers/writers.
      await appendPursuitContextEntryAndSync(userId, goal.id, {
        kind: "create",
        text: description,
      });
    }

    if (input.status !== "COMPLETE") {
      try {
        await recomputeGoalStatus(goal.id);
      } catch (recErr) {
        console.error("[POST /api/goals] recomputeGoalStatus failed", recErr);
      }
    }

    if (isLifeAreaId(branchRecord.themeId)) {
      await unlockThemesForUser(prisma, userId, [branchRecord.themeId]);
    }

    if (
      shouldGenerateRoadmap(input.generateRoadmap) &&
      input.status !== "MAINTAINING" &&
      input.goalType !== "identity"
    ) {
      const deadlineStr = deadline ? deadline.toISOString().slice(0, 10) : "No fixed deadline";
      const roadmapInput = {
        title,
        description: description || title,
        lifeArea,
        startingPoint: "Starting from where I am now",
        biggestObstacle: "Time and consistency",
        hoursPerWeek: "A few hours per week",
        deadline: deadlineStr,
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

    const categoryLabel = branchRecord.label ?? "Category";

    await markPursuitReadingDirty(userId, goal.id, "pursuit_created", {
      details: { event: "created", title: goal.title },
    });

    after(() => {
      void persistGoalShortLabel(goal.id).catch((err) =>
        console.error("[POST /api/goals] persistGoalShortLabel failed", err),
      );
    });

    return NextResponse.json(
      {
        goal: { id: goal.id, title: goal.title },
        categoryLabel,
        branchLabel: categoryLabel,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/goals] create failed", err);
    const isDev = process.env.NODE_ENV === "development";
    let message = "Could not create pursuit";
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
