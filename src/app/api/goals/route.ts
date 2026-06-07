import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { requireApiSessionUserId } from "@/lib/api-auth";
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
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import {
  createGoalPayloadSchema,
  deadlineIsInFutureLocal,
  parseLocalDateOnly,
} from "@/lib/validation/create-goal";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/branch-sequence";
import { activateHubForUser } from "@/lib/system-hubs";
import { assignPursuitIconSafe } from "@/lib/ai/assign-pursuit-icon";
import { matchPreferredOverrideIconSlug } from "@/lib/icons/match-pursuit-icon-override";

function logPerfProbe(traceId: string | null, label: string, data: Record<string, unknown>): void {
  console.log(`[PERF_PROBE] ${label}`, JSON.stringify({ traceId, ...data }));
}

function shouldGenerateRoadmap(requested: boolean | undefined): boolean {
  if (!requested) return false;
  if (process.env.NODE_ENV !== "development") return true;
  return process.env.ENABLE_AI_ROADMAPS_IN_DEV?.trim().toLowerCase() === "true";
}

function redirectToMoments(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/marks";
  return NextResponse.redirect(url, 308);
}

export async function GET(request: Request) {
  return redirectToMoments(request);
}

export async function POST(request: Request) {
  const handlerStart = Date.now();
  const traceId = request.headers.get("X-Perf-Trace");
  const stages: Record<string, number> = {};

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
  stages.auth_parse = Date.now() - handlerStart;

  const input = parsed.data;
  const branchStart = Date.now();
  const branchRecord = await prisma.branch.findFirst({
    where: { id: input.branchId.trim(), userId },
    select: { id: true, limbId: true, name: true, label: true, isActive: true },
  });
  if (!branchRecord) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  if (!branchRecord.isActive) {
    await activateHubForUser(prisma, userId, branchRecord.id);
  }
  stages.branch_lookup = Date.now() - branchStart;

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
    /** Resolve branch-line sequence position from the optional `anchor` (defaults to append). The reindex pass, if any, runs inside the same transaction as the goal insert so existing nodes don't temporarily share a slot. */
    const anchor = input.anchor ?? { kind: "append" as const };
    const sequenceStart = Date.now();
    const existingNodes = await loadBranchSequencedNodes(prisma, branchRecord.id);
    const resolution = resolveSequenceAnchor(existingNodes, anchor);
    const sequencePosition = resolution.sequencePosition;
    stages.sequence_load = Date.now() - sequenceStart;

    const iconStart = Date.now();
    const overridePreflight = matchPreferredOverrideIconSlug(title, description);
    const iconResult = await assignPursuitIconSafe({
      title,
      description,
      lifeArea,
    });
    const iconName = iconResult.iconName;
    stages.icon_assign_total = Date.now() - iconStart;
    const iconPerf = iconResult.perf;
    if (iconPerf) {
      stages.icon_override = iconPerf.path === "override" ? iconPerf.ms : 0;
      stages.icon_ai =
        iconPerf.path === "ai" || iconPerf.path === "ai_error" ? iconPerf.ms : 0;
    }

    const txStart = Date.now();
    const goal = await prisma.$transaction(async (tx) => {
      await applySequenceResolution(tx, resolution);
      return tx.goal.create({
        data: {
          userId,
          title,
          description,
          iconName,
          lifeArea,
          goalType: input.goalType,
          branchId: branchRecord.id,
          limbId: branchRecord.limbId,
          deadline,
          significance,
          bloomStatus: "ACTIVE",
          aiGenerated: false,
          future,
          year,
          month,
          sequencePosition,
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
    });
    stages.db_transaction = Date.now() - txStart;

    const bloomStart = Date.now();
    try {
      await recomputeGoalBloomStatus(goal.id);
    } catch (recErr) {
      console.error("[POST /api/goals] recomputeGoalBloomStatus failed", recErr);
    }
    stages.bloom_recompute = Date.now() - bloomStart;

    after(() => {
      void persistGoalShortLabel(goal.id).catch((err) =>
        console.error("[POST /api/goals] persistGoalShortLabel failed", err),
      );
    });

    if (shouldGenerateRoadmap(input.generateRoadmap)) {
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

    stages.handler_total = Date.now() - handlerStart;
    const iconPath = iconPerf?.path ?? "unknown";
    logPerfProbe(traceId, "POST /api/goals", {
      title,
      overridePreflight,
      iconPath,
      iconSlug: iconPerf?.slug ?? iconName,
      vercelRegion: process.env.VERCEL_REGION ?? null,
      stages,
    });

    return NextResponse.json(
      {
        goal: { id: goal.id, title: goal.title },
        branchLabel,
      },
      {
        status: 201,
        headers: {
          "X-Perf-Server-Ms": String(stages.handler_total),
          "X-Perf-Icon-Path": iconPath,
          "X-Perf-Stages": JSON.stringify(stages),
          ...(process.env.VERCEL_REGION
            ? { "X-Perf-Region": process.env.VERCEL_REGION }
            : {}),
        },
      },
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
