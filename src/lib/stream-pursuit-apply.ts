import type { BloomStatus, Prisma } from "@prisma/client";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import { prisma } from "@/lib/prisma";
import { activateHubForUser } from "@/lib/system-hubs";
import { queueMemoryUpdateAfterStream } from "@/lib/memory/queue-memory-update";
import {
  loadPursuitStreamContext,
  runPursuitStreamExtract,
  type PursuitStreamContext,
} from "@/lib/stream-pursuit-extract";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/branch-sequence";
import {
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
} from "@/lib/validation/marks-and-branches";
import type {
  StreamExtractResponse,
  StreamPursuitUpdate,
  StreamRunAppliedItem,
} from "@/types/stream";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;

function maxMilestonePosition(milestones: { position: number }[]): number {
  return milestones.reduce((acc, m) => Math.max(acc, m.position), -1);
}

function summarizeMarkTitle(rawInput: string, narrative: string): string {
  const fromNarrative = narrative.trim();
  if (fromNarrative.length > 0 && fromNarrative.length <= 120) return fromNarrative;
  const trimmed = rawInput.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}…`;
}

function ensurePursuitContextUpdate(
  extraction: StreamExtractResponse,
  goalId: string,
  rawInput: string,
): StreamPursuitUpdate | null {
  const existing = extraction.pursuitUpdates.find((u) => u.goalId === goalId);
  if (existing?.description?.trim()) return existing;

  const fromNarrative = extraction.narrativeSentence?.trim();
  if (fromNarrative && fromNarrative.length > 20) {
    return {
      goalId,
      description: fromNarrative.slice(0, 2000),
      ...(existing ?? {}),
    };
  }

  if (rawInput.trim().length > 40) {
    return {
      goalId,
      description: rawInput.trim().slice(0, 2000),
      ...(existing ?? {}),
    };
  }

  return existing ?? null;
}

export type PursuitStreamApplyResult =
  | {
      ok: true;
      streamRunId: string;
      rawInput: string;
      expiresAt: string;
      narrativeSentence: string;
      summary: {
        total: number;
        context: number;
        milestones: number;
        marks: number;
        status: number;
      };
      items: StreamRunAppliedItem[];
    }
  | { ok: false; streamRunId: string; rawInput: string; error: string; status: number };

export async function applyPursuitStream(
  userId: string,
  pursuitId: string,
  input: string,
  inputMode: "text" | "voice" = "text",
): Promise<PursuitStreamApplyResult> {
  const ctx = await loadPursuitStreamContext(userId, pursuitId);
  if (!ctx) {
    return { ok: false, streamRunId: "", rawInput: input, error: "Pursuit not found", status: 404 };
  }

  const goalRow = await prisma.goal.findFirst({
    where: { id: pursuitId, userId },
    select: { description: true, bloomStatus: true, branchId: true },
  });
  if (!goalRow?.branchId) {
    return { ok: false, streamRunId: "", rawInput: input, error: "Pursuit not found", status: 404 };
  }

  const expiresAt = new Date(Date.now() + RUN_TTL_MS);
  let run: {
    id: string;
    rawInput: string;
    previousDescription: string | null;
    previousBloomStatus: BloomStatus | null;
  };
  try {
    run = await prisma.streamRun.create({
      data: {
        userId,
        goalId: pursuitId,
        branchId: ctx.branchId,
        limbId: ctx.limbId,
        rawInput: input.trim().slice(0, 4000),
        inputMode,
        status: "pending",
        previousDescription: goalRow.description,
        previousBloomStatus: goalRow.bloomStatus,
        expiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("StreamRun") || message.includes("does not exist")) {
      return {
        ok: false,
        streamRunId: "",
        rawInput: input,
        error: "Stream runs table is missing. Run: npx prisma migrate deploy",
        status: 503,
      };
    }
    throw err;
  }

  let extraction: StreamExtractResponse;
  try {
    extraction = await runPursuitStreamExtract(userId, ctx, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extract failed";
    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "failed", summaryJson: { error: message } },
    });
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: message,
      status: 503,
    };
  }

  const contextUpdate = ensurePursuitContextUpdate(extraction, pursuitId, input);
  const pursuitUpdates = extraction.pursuitUpdates.filter((u) => u.goalId === pursuitId);
  if (contextUpdate && !pursuitUpdates.some((u) => u === contextUpdate)) {
    const idx = pursuitUpdates.findIndex((u) => u.goalId === pursuitId);
    if (idx >= 0) {
      pursuitUpdates[idx] = { ...pursuitUpdates[idx], ...contextUpdate };
    } else {
      pursuitUpdates.push(contextUpdate);
    }
  }

  const items: StreamRunAppliedItem[] = [];

  const branchRow = await prisma.branch.findFirst({
    where: { id: ctx.branchId, userId },
    select: { id: true, isActive: true },
  });
  if (!branchRow) {
    return { ok: false, streamRunId: run.id, rawInput: run.rawInput, error: "Hub not found", status: 404 };
  }
  if (!branchRow.isActive) {
    await activateHubForUser(prisma, userId, branchRow.id);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: ctx.branchId, userId },
        select: { id: true, limbId: true, isActive: true },
      });
      if (!branch) throw new Error("Hub not found");

      for (const update of pursuitUpdates) {
        const data: {
          title?: string;
          description?: string;
          bloomStatus?: BloomStatus;
          bloomedAt?: Date | null;
          sourceStreamRunId?: string;
        } = { sourceStreamRunId: run.id };

        if (update.title?.trim()) data.title = update.title.trim();
        if (update.description?.trim()) data.description = update.description.trim();
        if (update.bloomStatus) {
          data.bloomStatus = update.bloomStatus as BloomStatus;
          data.bloomedAt = update.bloomStatus === "COMPLETE" ? new Date() : null;
        }

        if (Object.keys(data).length <= 1) continue;

        await tx.goal.update({ where: { id: pursuitId }, data });

        if (data.description) {
          items.push({
            kind: "context",
            goalId: pursuitId,
            label: "Updated pursuit context",
            previousDescription: run.previousDescription,
            newDescription: data.description,
          });
        }
        if (data.bloomStatus && data.bloomStatus !== run.previousBloomStatus) {
          items.push({
            kind: "status",
            goalId: pursuitId,
            previousBloomStatus:
              (run.previousBloomStatus as "ACTIVE" | "ON_HOLD" | "COMPLETE") ?? "ACTIVE",
            newBloomStatus: data.bloomStatus as "ACTIVE" | "ON_HOLD" | "COMPLETE",
          });
        }
        if (data.title) {
          void persistGoalShortLabel(pursuitId);
        }
      }

      for (const ms of extraction.milestones) {
        const title = ms.title.trim();
        if (!title) continue;

        const goal = await tx.goal.findFirst({
          where: { id: pursuitId, userId, branchId: branch.id },
          select: { id: true, goalType: true },
        });
        if (!goal || goal.goalType === "practice" || goal.goalType === "identity") continue;

        const rows = await tx.milestone.findMany({
          where: { goalId: pursuitId },
          select: { position: true },
        });
        const position = maxMilestonePosition(rows) + 1;

        const created = await tx.milestone.create({
          data: {
            goalId: pursuitId,
            title,
            description: "",
            position,
            sourceStreamRunId: run.id,
          },
        });
        items.push({ kind: "milestone", milestoneId: created.id, title: created.title });
      }

      let marks = extraction.marks;
      if (marks.length === 0 && items.length === 0) {
        marks = [
          {
            title: summarizeMarkTitle(input, extraction.narrativeSentence ?? ""),
            date: null,
          },
        ];
      }

      const appendAnchor = { kind: "append" as const };
      const nextSequencePosition = async () => {
        const nodes = await loadBranchSequencedNodes(tx, branch.id);
        const resolution = resolveSequenceAnchor(nodes, appendAnchor);
        await applySequenceResolution(tx, resolution);
        return resolution.sequencePosition;
      };

      for (const mark of marks) {
        const title = displayMarkTitleFromInput(mark.title, undefined);
        if (!title) continue;

        const resolved = resolveMarkInputDate({
          date: mark.date ?? new Date().toISOString().slice(0, 10),
        });
        if (!resolved.ok) continue;

        const sequencePosition = await nextSequencePosition();
        const created = await tx.mark.create({
          data: {
            userId,
            branchId: branch.id,
            limbId: branch.limbId,
            title,
            description: null,
            date: resolved.d,
            sentiment: "positive",
            archived: false,
            future: isMarkDateInTheFuture(resolved.d),
            year: resolved.d.getUTCFullYear(),
            month: resolved.d.getUTCMonth() + 1,
            sequencePosition,
            kind: "stream",
            sourceStreamRunId: run.id,
          },
        });
        items.push({ kind: "mark", markId: created.id, title: created.title });
      }
    });

    await recomputeGoalBloomStatus(pursuitId).catch((e) => {
      console.error("[applyPursuitStream] recomputeGoalBloomStatus", e);
    });

    const summary = {
      total: items.length,
      context: items.filter((i) => i.kind === "context").length,
      milestones: items.filter((i) => i.kind === "milestone").length,
      marks: items.filter((i) => i.kind === "mark").length,
      status: items.filter((i) => i.kind === "status").length,
    };

    await prisma.streamRun.update({
      where: { id: run.id },
      data: {
        status: "applied",
        summaryJson: { summary, items },
      },
    });

    queueMemoryUpdateAfterStream(userId, run.rawInput);

    return {
      ok: true,
      streamRunId: run.id,
      rawInput: run.rawInput,
      expiresAt: expiresAt.toISOString(),
      narrativeSentence: extraction.narrativeSentence ?? "",
      summary,
      items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not apply stream";
    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "failed", summaryJson: { error: message, items } },
    });
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: message,
      status: 500,
    };
  }
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
        // Child-pursuit creation run: remove the created child(ren) + their milestones.
        // Only delete when the child still belongs to this run (sourceStreamRunId unchanged),
        // so later re-streams/edits never corrupt data — leave such children in place.
        for (const item of createdChildPursuits) {
          const child = await tx.goal.findFirst({
            where: { id: item.createdGoalId, userId },
            select: { id: true, sourceStreamRunId: true },
          });
          if (child && child.sourceStreamRunId === run.id) {
            await tx.goal.delete({ where: { id: child.id } });
          }
        }
        // The parent pursuit is intentionally not modified by this flow, so do not revert it.
      } else {
        const goal = await tx.goal.findFirst({
          where: { id: run.goalId, userId },
          select: { id: true, bloomStatus: true },
        });
        if (goal) {
          const data: {
            description?: string;
            bloomStatus?: BloomStatus;
            bloomedAt?: Date | null;
            sourceStreamRunId?: null;
          } = { sourceStreamRunId: null };

          if (run.previousDescription != null) {
            data.description = run.previousDescription;
          }
          if (run.previousBloomStatus != null) {
            data.bloomStatus = run.previousBloomStatus;
            data.bloomedAt = run.previousBloomStatus === "COMPLETE" ? new Date() : null;
          }

          await tx.goal.update({ where: { id: goal.id }, data });
        }
      }

      await tx.streamRun.update({
        where: { id: run.id },
        data: { status: "undone" },
      });
    });

    await recomputeGoalBloomStatus(run.goalId).catch(() => {});

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
