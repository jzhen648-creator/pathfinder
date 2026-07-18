import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { excludePursuitFromInterpretation } from "@/lib/insights/invalidate-reading-caches";
import {
  clearQuickQuestionsQuietUntilInCache,
  invalidateDerivedEnrichmentOnTitleChange,
  pruneMootPendingClarifiersOnStatusChange,
} from "@/lib/pursuit/apply-clarifier-answers";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import {
  clearReadingDirtyForPursuits,
  markPursuitReadingDirty,
} from "@/lib/map/reading-dirty-ledger";
import { buildFieldChanges } from "@/lib/map/reading-dirty-details";
import { resolvePursuitStatusFromBody } from "@/lib/pursuit-status-api";
import { prisma } from "@/lib/prisma";
import { recordPursuitStatusTransition } from "@/lib/pursuit/record-status-transition";
import { clampSignificance } from "@/lib/pursuit/significance";
import { updateGoalPayloadSchema } from "@/lib/validation/update-goal";
import {
  appendPursuitContextEntryAndSync,
} from "@/lib/pursuit/pursuit-context-log";
import { QUICK_QUESTION_MIN_NOTE_CHARS } from "@/lib/pursuit/clarifier-prompt-blocks";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { goalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const resolvedStatus = resolvePursuitStatusFromBody(raw);
  const parsed = updateGoalPayloadSchema.safeParse({
    ...raw,
    ...(resolvedStatus
      ? {
          status: raw.status ?? resolvedStatus,
          bloomStatus: raw.bloomStatus ?? resolvedStatus,
        }
      : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      goalType: true,
      title: true,
      description: true,
      status: true,
      deadline: true,
      significance: true,
      archived: true,
      completedAt: true,
      createdAt: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.goalType === "moment" || existing.goalType === "event") {
    return NextResponse.json({ error: "Timeline marks use a different editor" }, { status: 400 });
  }

  const input = parsed.data;
  const titleChanged =
    input.title !== undefined &&
    input.title.trim().length > 0 &&
    input.title.trim() !== existing.title.trim();
  const data: {
    title?: string;
    description?: string;
    significance?: number | null;
    timelineStart?: Date | null;
    deadline?: Date | null;
    year?: number;
    month?: number | null;
    future?: boolean;
    archived?: boolean;
    status?: "ACTIVE" | "PAUSED" | "COMPLETE" | "MAINTAINING";
    completedAt?: Date | null;
    endedAt?: Date | null;
    endReason?: string | null;
    mapGridQ?: number | null;
    mapGridR?: number | null;
    iconName?: string | null;
    currentAmount?: number | null;
    targetAmount?: number | null;
    unit?: string | null;
    amountBasis?: string | null;
    background?: string | null;
    chapterType?: string | null;
    identityFacts?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    currentFocus?: string | null;
  } = {};
  if (input.title !== undefined) data.title = input.title.trim();
  // Retired pending post-TestFlight cleanup — no live readers/writers.
  const descriptionPatch =
    input.description !== undefined ? input.description.trim() : undefined;
  if (descriptionPatch !== undefined && descriptionPatch !== existing.description.trim()) {
    if (descriptionPatch.length === 0) {
      data.description = "";
    }
  }
  if (input.significance !== undefined) {
    data.significance =
      input.significance == null
        ? null
        : clampSignificance(input.significance);
  }
  if (input.timelineStart !== undefined) {
    data.timelineStart =
      input.timelineStart === null
        ? null
        : new Date(`${input.timelineStart}T00:00:00.000Z`);
  }
  if (input.deadline !== undefined) {
    if (input.deadline === null) {
      data.deadline = null;
    } else {
      const deadline = new Date(`${input.deadline}T00:00:00.000Z`);
      data.deadline = deadline;
      data.year = deadline.getUTCFullYear();
      data.month = deadline.getUTCMonth() + 1;
      data.future = deadline.getTime() > Date.now();
    }
  }
  if (input.archived !== undefined) data.archived = input.archived;
  if (input.mapGridQ !== undefined) data.mapGridQ = input.mapGridQ;
  if (input.mapGridR !== undefined) data.mapGridR = input.mapGridR;
  if (input.iconName !== undefined) {
    data.iconName =
      input.iconName == null ? null : input.iconName.trim().toLowerCase() || null;
  }
  if (input.currentAmount !== undefined) data.currentAmount = input.currentAmount;
  if (input.targetAmount !== undefined) data.targetAmount = input.targetAmount;
  if (input.unit !== undefined) data.unit = input.unit?.trim() || null;
  if (input.amountBasis !== undefined) data.amountBasis = input.amountBasis;
  if (input.background !== undefined) data.background = input.background;
  if (input.chapterType !== undefined) data.chapterType = input.chapterType;
  if (input.identityFacts !== undefined) {
    data.identityFacts =
      input.identityFacts === null ? Prisma.DbNull : input.identityFacts;
  }
  if (input.currentFocus !== undefined) {
    data.currentFocus =
      input.currentFocus === null ? null : input.currentFocus.trim() || null;
  }
  if (input.completedAt !== undefined) {
    data.completedAt = new Date(`${input.completedAt}T00:00:00.000Z`);
  }

  const pursuitStatus = input.status ?? input.bloomStatus;
  if (pursuitStatus !== undefined) {
    data.status = pursuitStatus;
    if (pursuitStatus === "PAUSED") {
      data.endedAt = new Date();
    } else if (pursuitStatus === "COMPLETE") {
      if (input.completedAt === undefined) {
        data.completedAt = new Date();
      }
      data.deadline = null;
      data.future = false;
      data.endedAt = null;
      data.endReason = null;
    } else {
      data.endedAt = null;
      data.endReason = null;
      data.completedAt = null;
    }
  }

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data,
    select: {
      id: true,
      title: true,
      description: true,
      significance: true,
      categoryId: true,
      goalType: true,
      status: true,
      iconName: true,
      completedAt: true,
    },
  });

  if (pursuitStatus !== undefined && pursuitStatus !== existing.status) {
    await recordPursuitStatusTransition({
      userId,
      goalId,
      from: existing.status,
      to: pursuitStatus,
      goalCreatedAt: existing.createdAt,
    });
  }

  // Retired pending post-TestFlight cleanup — no live readers/writers.
  if (
    descriptionPatch !== undefined &&
    descriptionPatch !== existing.description.trim()
  ) {
    if (descriptionPatch.length === 0) {
      const syncedDescription = await appendPursuitContextEntryAndSync(userId, goalId, {
        kind: "manual_edit",
        text: "",
      });
      goal.description = syncedDescription;
    } else {
      const syncedDescription = await appendPursuitContextEntryAndSync(userId, goalId, {
        kind: "manual_edit",
        text: descriptionPatch,
      });
      goal.description = syncedDescription;
    }
  }

  if (titleChanged) {
    await invalidateDerivedEnrichmentOnTitleChange(userId, goalId, {
      reconcileDetails: input.reconcileDetails === true,
    });
    after(() => {
      void persistGoalShortLabel(goalId).catch((err) =>
        console.error("[PATCH /api/goals/[goalId]] persistGoalShortLabel failed", err),
      );
    });
  }

  if (pursuitStatus !== undefined) {
    await pruneMootPendingClarifiersOnStatusChange(userId, goalId, pursuitStatus);
  }

  if (input.background !== undefined) {
    const noteChars = (input.background ?? "").trim().length;
    if (noteChars >= QUICK_QUESTION_MIN_NOTE_CHARS) {
      await clearQuickQuestionsQuietUntilInCache(userId, goalId);
    }
  }

  const dirtyUpdates: Record<string, unknown> = {};
  if (input.title !== undefined) dirtyUpdates.title = data.title;
  if (input.chapterType !== undefined) dirtyUpdates.chapterType = data.chapterType;
  if (input.identityFacts !== undefined) dirtyUpdates.identityFacts = input.identityFacts;
  if (input.currentFocus !== undefined) dirtyUpdates.currentFocus = data.currentFocus;
  if (pursuitStatus !== undefined) dirtyUpdates.status = data.status;
  if (input.deadline !== undefined || pursuitStatus === "COMPLETE") {
    dirtyUpdates.deadline = data.deadline ? data.deadline.toISOString().slice(0, 10) : null;
  }
  if (input.significance !== undefined) dirtyUpdates.significance = data.significance;
  if (input.completedAt !== undefined || pursuitStatus === "COMPLETE") {
    dirtyUpdates.completedAt = goal.completedAt
      ? goal.completedAt.toISOString().slice(0, 10)
      : null;
  }

  const changes = buildFieldChanges(
    {
      ...existing,
      completedAt: existing.completedAt
        ? existing.completedAt.toISOString().slice(0, 10)
        : null,
    },
    dirtyUpdates,
    ["title", "status", "deadline", "significance", "completedAt"],
  );

  const restored = input.archived === false && existing.archived === true;
  const archived = input.archived === true && existing.archived === false;

  if (restored) {
    await clearReadingDirtyForPursuits(userId, [goal.id]);
    await markPursuitReadingDirty(userId, goal.id, "pursuit_restored", {
      details: { event: "restored", title: goal.title },
    });
  } else if (archived) {
    await clearReadingDirtyForPursuits(userId, [goal.id]);
    await excludePursuitFromInterpretation(userId, goal.id);
    await markPursuitReadingDirty(userId, goal.id, "pursuit_updated", {
      details: { changes, title: goal.title },
    });
  } else {
    await markPursuitReadingDirty(userId, goal.id, "pursuit_updated", {
      details: changes.length > 0 ? { changes, title: goal.title } : { title: goal.title },
    });
  }

  return NextResponse.json({ goal });
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { goalId } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, title: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.update({
    where: { id: goalId },
    data: { archived: true },
  });

  await clearReadingDirtyForPursuits(userId, [goalId]);
  await excludePursuitFromInterpretation(userId, goalId);
  await markPursuitReadingDirty(userId, goalId, "pursuit_archived", {
    details: { event: "archived", title: existing.title },
  });

  return NextResponse.json({ ok: true });
}
