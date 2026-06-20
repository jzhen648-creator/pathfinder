import type { PursuitStatus } from "@prisma/client";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";
import { prisma } from "@/lib/prisma";
import type { StreamRunAppliedItem } from "@/types/stream";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;

export type PursuitCaptureSaveResult =
  | {
      ok: true;
      runId: string;
      rawInput: string;
      expiresAt: string;
      appended: boolean;
    }
  | { ok: false; error: string; status: number };

/** Save or append a pending capture note — digested on map ai-sync when reflect is off. */
export async function savePendingPursuitCapture(
  userId: string,
  pursuitId: string,
  input: string,
  inputMode: "text" | "voice" = "text",
): Promise<PursuitCaptureSaveResult> {
  const trimmed = input.trim().slice(0, 4000);
  if (!trimmed) {
    return { ok: false, error: "Note cannot be empty", status: 400 };
  }

  const goalRow = await prisma.goal.findFirst({
    where: {
      id: pursuitId,
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      description: true,
      status: true,
      categoryId: true,
      themeId: true,
      themeCategory: { select: { themeId: true } },
    },
  });
  if (!goalRow?.categoryId) {
    return { ok: false, error: "Pursuit not found", status: 404 };
  }

  const themeId = goalRow.themeId ?? goalRow.themeCategory?.themeId ?? "becoming";
  const now = new Date();
  const expiresAt = new Date(Date.now() + RUN_TTL_MS);

  const existing = await prisma.streamRun.findFirst({
    where: {
      userId,
      goalId: pursuitId,
      status: "pending",
      expiresAt: { gt: now },
    },
    orderBy: { updatedAt: "desc" },
  });

  try {
    if (existing) {
      const merged = [existing.rawInput.trim(), trimmed].filter(Boolean).join("\n\n").slice(0, 4000);
      const updated = await prisma.streamRun.update({
        where: { id: existing.id },
        data: { rawInput: merged, inputMode, expiresAt },
      });
      return {
        ok: true,
        runId: updated.id,
        rawInput: updated.rawInput,
        expiresAt: updated.expiresAt.toISOString(),
        appended: true,
      };
    }

    const created = await prisma.streamRun.create({
      data: {
        userId,
        goalId: pursuitId,
        categoryId: goalRow.categoryId,
        themeId,
        rawInput: trimmed,
        inputMode,
        status: "pending",
        previousDescription: goalRow.description,
        previousStatus: goalRow.status,
        expiresAt,
      },
    });

    return {
      ok: true,
      runId: created.id,
      rawInput: created.rawInput,
      expiresAt: created.expiresAt.toISOString(),
      appended: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("StreamRun") || message.includes("does not exist")) {
      return {
        ok: false,
        error: "Stream runs table is missing. Run: npx prisma migrate deploy",
        status: 503,
      };
    }
    throw err;
  }
}

/** @deprecated Prefer savePendingPursuitCapture — kept for route alias. */
export async function applyPursuitStream(
  userId: string,
  pursuitId: string,
  input: string,
  inputMode: "text" | "voice" = "text",
): Promise<PursuitCaptureSaveResult> {
  return savePendingPursuitCapture(userId, pursuitId, input, inputMode);
}

export async function undoPursuitStreamRun(
  userId: string,
  streamRunId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const run = await prisma.streamRun.findFirst({
    where: { id: streamRunId, userId },
  });
  if (!run) return { ok: false, error: "Stream run not found", status: 404 };
  if (run.status === "undone") return { ok: true };
  if (run.status !== "applied") {
    return { ok: false, error: "This stream run cannot be undone", status: 400 };
  }

  const summaryJson = run.summaryJson as { items?: StreamRunAppliedItem[] } | null;
  const appliedItems = Array.isArray(summaryJson?.items) ? summaryJson.items : [];
  const createdChildPursuits = appliedItems.filter(
    (item): item is Extract<StreamRunAppliedItem, { kind: "pursuit" }> => item.kind === "pursuit",
  );
  const isChildPursuitRun = createdChildPursuits.length > 0;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.milestone.deleteMany({ where: { sourceStreamRunId: run.id } });
      await tx.mark.deleteMany({ where: { sourceStreamRunId: run.id } });

      if (isChildPursuitRun) {
        for (const item of createdChildPursuits) {
          const child = await tx.goal.findFirst({
            where: { id: item.createdGoalId, userId },
            select: { id: true, sourceStreamRunId: true },
          });
          if (child && child.sourceStreamRunId === run.id) {
            await tx.goal.delete({ where: { id: child.id } });
          }
        }
      } else {
        const goal = await tx.goal.findFirst({
          where: { id: run.goalId, userId },
          select: { id: true, status: true },
        });
        if (goal) {
          const data: {
            description?: string;
            status?: PursuitStatus;
            completedAt?: Date | null;
            sourceStreamRunId?: null;
          } = { sourceStreamRunId: null };

          if (run.previousDescription != null) {
            data.description = run.previousDescription;
          }
          if (run.previousStatus != null) {
            data.status = run.previousStatus;
            data.completedAt = run.previousStatus === "COMPLETE" ? new Date() : null;
          }

          await tx.goal.update({ where: { id: goal.id }, data });
        }
      }

      await tx.streamRun.update({
        where: { id: run.id },
        data: { status: "undone" },
      });
    });

    await recomputeGoalStatus(run.goalId).catch(() => {});

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Undo failed";
    return { ok: false, error: message, status: 500 };
  }
}

export async function getPursuitStreamRun(
  userId: string,
  streamRunId: string,
): Promise<{
  streamRunId: string;
  rawInput: string;
  status: string;
  expiresAt: string;
  summary: { total: number; context: number; milestones: number; marks: number; status: number };
  items: StreamRunAppliedItem[];
} | null> {
  const run = await prisma.streamRun.findFirst({
    where: { id: streamRunId, userId },
  });
  if (!run || run.status !== "applied") return null;
  if (run.expiresAt.getTime() < Date.now()) return null;

  const json = run.summaryJson as {
    summary?: {
      total: number;
      context: number;
      milestones: number;
      marks: number;
      status: number;
    };
    items?: StreamRunAppliedItem[];
  } | null;

  const items = Array.isArray(json?.items) ? json.items : [];
  const summary = json?.summary ?? {
    total: items.length,
    context: items.filter((i) => i.kind === "context").length,
    milestones: items.filter((i) => i.kind === "milestone").length,
    marks: items.filter((i) => i.kind === "mark").length,
    status: items.filter((i) => i.kind === "status").length,
  };

  return {
    streamRunId: run.id,
    rawInput: run.rawInput,
    status: run.status,
    expiresAt: run.expiresAt.toISOString(),
    summary: summary as {
      total: number;
      context: number;
      milestones: number;
      marks: number;
      status: number;
    },
    items,
  };
}
