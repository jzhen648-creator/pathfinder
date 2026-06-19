import type { Prisma, PursuitStatus } from "@prisma/client";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";
import { goalAllowsStreamMilestones } from "@/lib/goal-type";
import { prisma } from "@/lib/prisma";
import { activateCategoryForUser } from "@/lib/system-categories";
import { deferMemoryUpdateAfterStream } from "@/lib/memory/deferred-memory-updates";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import {
  loadPursuitStreamContext,
  runPursuitStreamExtract,
  type PursuitStreamContext,
} from "@/lib/stream-pursuit-extract";
import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import {
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
} from "@/lib/validation/marks-and-categories";
import {
  generalizePursuitTitle,
  replacePursuitContextDescription,
  preferExistingMapTitle,
  titleLooksOverSpecific,
} from "@/lib/pursuit/pursuit-title";
import { syncFinanceMetricsFromProse } from "@/lib/pursuit/pursuit-finance";
import { appendPursuitContextEntryAndSync } from "@/lib/pursuit/pursuit-context-log";
import {
  streamExtractFailureStatus,
  streamExtractUserMessage,
} from "@/lib/stream-extract-errors";
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

function stabilizePursuitUpdate(
  existingTitle: string,
  existingDescription: string | null,
  update: StreamPursuitUpdate,
  rawInput: string,
): StreamPursuitUpdate {
  const next: StreamPursuitUpdate = { ...update };

  if (next.title?.trim()) {
    if (preferExistingMapTitle(existingTitle, next.title)) {
      delete next.title;
    } else if (titleLooksOverSpecific(next.title)) {
      next.title = generalizePursuitTitle(next.title);
    }
  }

  if (next.description?.trim()) {
    next.description = replacePursuitContextDescription(existingDescription, next.description);
  } else if (titleLooksOverSpecific(rawInput) || rawInput.trim().length > 20) {
    next.description = replacePursuitContextDescription(existingDescription, rawInput.trim());
  }

  if (!next.title && titleLooksOverSpecific(existingTitle) && next.description?.trim()) {
    next.title = generalizePursuitTitle(existingTitle);
  }

  return next;
}

export type PursuitCaptureSaveResult =
  | {
      ok: true;
      runId: string;
      rawInput: string;
      expiresAt: string;
      appended: boolean;
    }
  | { ok: false; error: string; status: number };

/** Save or append a pending capture note — no Gemini until map ai-sync digests it. */
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

  const ctx = await loadPursuitStreamContext(userId, pursuitId);
  if (!ctx) {
    return { ok: false, error: "Pursuit not found", status: 404 };
  }

  const goalRow = await prisma.goal.findFirst({
    where: { id: pursuitId, userId },
    select: { description: true, status: true, categoryId: true },
  });
  if (!goalRow?.categoryId) {
    return { ok: false, error: "Pursuit not found", status: 404 };
  }

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
        categoryId: ctx.branchId,
        themeId: ctx.themeId,
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

/** @deprecated Prefer savePendingPursuitCapture — kept for route alias. */
export async function applyPursuitStream(
  userId: string,
  pursuitId: string,
  input: string,
  inputMode: "text" | "voice" = "text",
): Promise<PursuitCaptureSaveResult> {
  return savePendingPursuitCapture(userId, pursuitId, input, inputMode);
}

export async function digestPendingStreamRun(
  userId: string,
  runId: string,
  options?: { deferMemory?: boolean; inputOverride?: string },
): Promise<PursuitStreamApplyResult> {
  const run = await prisma.streamRun.findFirst({
    where: { id: runId, userId, status: "pending" },
  });
  if (!run) {
    return {
      ok: false,
      streamRunId: runId,
      rawInput: "",
      error: "Pending capture not found",
      status: 404,
    };
  }
  if (run.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: "Capture expired — save a new note",
      status: 410,
    };
  }

  const pursuitId = run.goalId;
  const input = options?.inputOverride?.trim() || run.rawInput;
  const ctx = await loadPursuitStreamContext(userId, pursuitId);
  if (!ctx) {
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: "Pursuit not found",
      status: 404,
    };
  }

  const goalRow = await prisma.goal.findFirst({
    where: { id: pursuitId, userId },
    select: { description: true, status: true, categoryId: true, title: true },
  });
  if (!goalRow?.categoryId) {
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: "Pursuit not found",
      status: 404,
    };
  }

  const expiresAt = run.expiresAt;

  let extraction: StreamExtractResponse;
  try {
    extraction = await runPursuitStreamExtract(userId, ctx, input);
  } catch (err) {
    const status = streamExtractFailureStatus(err);
    const message = streamExtractUserMessage(status);
    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "failed", summaryJson: { error: message } },
    });
    return {
      ok: false,
      streamRunId: run.id,
      rawInput: run.rawInput,
      error: message,
      status,
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

  const branchRow = await prisma.themeCategory.findFirst({
    where: { id: ctx.branchId, userId },
    select: { id: true, isActive: true },
  });
  if (!branchRow) {
    return { ok: false, streamRunId: run.id, rawInput: run.rawInput, error: "Hub not found", status: 404 };
  }
  if (!branchRow.isActive) {
    await activateCategoryForUser(prisma, userId, branchRow.id);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const branch = await tx.themeCategory.findFirst({
        where: { id: ctx.branchId, userId },
        select: { id: true, themeId: true, isActive: true },
      });
      if (!branch) throw new Error("Hub not found");

      for (const rawUpdate of pursuitUpdates) {
        const update = stabilizePursuitUpdate(
          goalRow.title,
          run.previousDescription,
          rawUpdate,
          run.rawInput,
        );
        const data: {
          title?: string;
          description?: string;
          status?: PursuitStatus;
          completedAt?: Date | null;
          sourceStreamRunId?: string;
          currentAmount?: number;
          unit?: string;
        } = { sourceStreamRunId: run.id };

        if (update.title?.trim()) data.title = update.title.trim();
        // Grounding for description text lives in stream-pursuit-extract pursuitFocus — not validated here.
        if (update.description?.trim()) data.description = update.description.trim();
        if (update.status && goalRow.status !== "MAINTAINING") {
          data.status = update.status as PursuitStatus;
          data.completedAt = update.status === "COMPLETE" ? new Date() : null;
        }

        if (ctx.themeId === "finance" && data.description) {
          const metrics = syncFinanceMetricsFromProse(data.description);
          if (metrics) {
            data.currentAmount = metrics.currentAmount;
            data.unit = metrics.unit;
          }
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
        if (data.status && data.status !== run.previousStatus) {
          items.push({
            kind: "status",
            goalId: pursuitId,
            previousStatus:
              (run.previousStatus as "ACTIVE" | "PAUSED" | "COMPLETE") ?? "ACTIVE",
            newStatus: data.status as "ACTIVE" | "PAUSED" | "COMPLETE",
          });
        }
      }

      for (const ms of extraction.milestones) {
        const title = ms.title.trim();
        if (!title) continue;

        const goal = await tx.goal.findFirst({
          where: { id: pursuitId, userId, categoryId: branch.id },
          select: { id: true, goalType: true, status: true },
        });
        if (!goal || !goalAllowsStreamMilestones(goal)) continue;

        const existingMilestone = await tx.milestone.findFirst({
          where: {
            goalId: pursuitId,
            title: { equals: title, mode: "insensitive" },
          },
        });
        if (existingMilestone) continue;

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
        const nodes = await loadCategorySequencedNodes(tx, branch.id);
        const resolution = resolveSequenceAnchor(nodes, appendAnchor);
        await applySequenceResolution(tx, resolution);
        return resolution.sequencePosition;
      };

      for (const mark of marks) {
        const title = displayMarkTitleFromInput(mark.title, undefined);
        if (!title) continue;

        const resolved = resolveMarkInputDate({
          date: mark.date ?? undefined,
        });
        if (!resolved.ok) continue;

        const sequencePosition = await nextSequencePosition();
        const created = await tx.mark.create({
          data: {
            userId,
            categoryId: branch.id,
            themeId: branch.themeId,
            title,
            description: null,
            date: resolved.d,
            sentiment: "positive",
            archived: false,
            future: resolved.d ? isMarkDateInTheFuture(resolved.d) : false,
            year: resolved.d?.getUTCFullYear() ?? null,
            month: resolved.d ? resolved.d.getUTCMonth() + 1 : null,
            sequencePosition,
            kind: "stream",
            sourceStreamRunId: run.id,
          },
        });
        items.push({ kind: "mark", markId: created.id, title: created.title });
      }
    });

    for (const item of items) {
      if (item.kind === "context" && item.newDescription?.trim()) {
        await appendPursuitContextEntryAndSync(userId, item.goalId, {
          kind: "stream_digest",
          text: item.newDescription.trim(),
        });
      }
    }

    await recomputeGoalStatus(pursuitId).catch((e) => {
      console.error("[digestPendingStreamRun] recomputeGoalStatus", e);
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

    if (options?.deferMemory !== false) {
      deferMemoryUpdateAfterStream(userId, run.rawInput);
    } else {
      const { queueMemoryUpdateAfterStream } = await import("@/lib/memory/queue-memory-update");
      queueMemoryUpdateAfterStream(userId, run.rawInput);
    }

    await markPursuitReadingDirty(userId, run.goalId, "note_digested", { streamRunId: run.id });

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

const DIGEST_BATCH_LIMIT = 5;

export type DigestCapturesResult = {
  processed: number;
  failed: number;
  errors: string[];
  rateLimited: boolean;
  remaining: number;
  memoryTextsDeferred: number;
  /** Actual Gemini extract calls made (not batched run count). */
  geminiCallsMade: number;
};

export type DigestCapturesOptions = {
  /** Max pending runs to attempt this sync (default 5). */
  runLimit?: number;
  /** Max Gemini calls for digest this sync — shares unified ai-sync budget. */
  maxGeminiCalls?: number;
};

/** Digest pending captures — resumable across sync taps; respects Gemini budget. */
export async function digestPendingCapturesBounded(
  userId: string,
  options?: DigestCapturesOptions | number,
): Promise<DigestCapturesResult> {
  const opts: DigestCapturesOptions =
    typeof options === "number" ? { runLimit: options } : (options ?? {});
  const runLimit = opts.runLimit ?? DIGEST_BATCH_LIMIT;
  const maxGeminiCalls = opts.maxGeminiCalls ?? runLimit;

  const now = new Date();
  const pending = await prisma.streamRun.findMany({
    where: {
      userId,
      status: "pending",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, goalId: true },
  });

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  let rateLimited = false;
  let memoryTextsDeferred = 0;
  let geminiCallsMade = 0;

  const batches = groupPendingByPursuit(pending);
  let runsAttempted = 0;

  for (const batch of batches) {
    if (runsAttempted >= runLimit) break;
    if (geminiCallsMade >= maxGeminiCalls) break;

    if (batch.runIds.length === 1) {
      const result = await digestPendingStreamRun(userId, batch.runIds[0]!, { deferMemory: true });
      runsAttempted += 1;
      if (result.ok) {
        processed += 1;
        memoryTextsDeferred += 1;
        geminiCallsMade += 1;
      } else {
        failed += 1;
        if (result.error) errors.push(result.error);
        if (result.status === 429) {
          rateLimited = true;
          break;
        }
      }
      continue;
    }

    const batchResult = await digestPendingStreamRunsBatch(userId, batch.runIds, { deferMemory: true });
    runsAttempted += batch.runIds.length;
    processed += batchResult.processed;
    failed += batchResult.failed;
    errors.push(...batchResult.errors);
    memoryTextsDeferred += batchResult.processed;
    geminiCallsMade += batchResult.geminiCallsMade;
    if (batchResult.rateLimited) {
      rateLimited = true;
      break;
    }
    if (runsAttempted >= runLimit) break;
  }

  const remaining = await countPendingCaptures(userId);

  return {
    processed,
    failed,
    errors,
    rateLimited,
    remaining,
    memoryTextsDeferred,
    geminiCallsMade,
  };
}

function groupPendingByPursuit(
  pending: Array<{ id: string; goalId: string }>,
): Array<{ goalId: string; runIds: string[] }> {
  const byGoal = new Map<string, string[]>();
  for (const row of pending) {
    const list = byGoal.get(row.goalId) ?? [];
    list.push(row.id);
    byGoal.set(row.goalId, list);
  }
  return [...byGoal.entries()].map(([goalId, runIds]) => ({ goalId, runIds }));
}

async function digestPendingStreamRunsBatch(
  userId: string,
  runIds: string[],
  options?: { deferMemory?: boolean },
): Promise<{ processed: number; failed: number; errors: string[]; rateLimited: boolean; geminiCallsMade: number }> {
  const runs = await prisma.streamRun.findMany({
    where: { id: { in: runIds }, userId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (runs.length === 0) {
    return { processed: 0, failed: 0, errors: [], rateLimited: false, geminiCallsMade: 0 };
  }

  const combinedInput = runs.map((r) => r.rawInput.trim()).filter(Boolean).join("\n\n---\n\n").slice(0, 4000);
  const primary = runs[0]!;
  const single = await digestPendingStreamRun(userId, primary.id, {
    deferMemory: options?.deferMemory,
    inputOverride: combinedInput,
  });
  if (single.ok) {
    for (const extra of runs.slice(1)) {
      await prisma.streamRun.update({
        where: { id: extra.id },
        data: {
          status: "applied",
          summaryJson: { batchedInto: primary.id, items: [] },
        },
      });
      await markPursuitReadingDirty(userId, extra.goalId, "note_digested_batch", {
        streamRunId: extra.id,
      });
    }
    return { processed: runs.length, failed: 0, errors: [], rateLimited: false, geminiCallsMade: 1 };
  }

  if (single.status === 429) {
    return {
      processed: 0,
      failed: 1,
      errors: single.error ? [single.error] : [],
      rateLimited: true,
      geminiCallsMade: 0,
    };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  let geminiCallsMade = 0;
  for (const run of runs) {
    const result = await digestPendingStreamRun(userId, run.id, options);
    if (result.ok) {
      processed += 1;
      geminiCallsMade += 1;
    } else {
      failed += 1;
      if (result.error) errors.push(result.error);
      if (result.status === 429) {
        return { processed, failed, errors, rateLimited: true, geminiCallsMade };
      }
    }
  }
  return { processed, failed, errors, rateLimited: false, geminiCallsMade };
}

export async function digestAllPendingCaptures(userId: string): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const result = await digestPendingCapturesBounded(userId, { runLimit: 999 });
  return {
    processed: result.processed,
    failed: result.failed,
    errors: result.errors,
  };
}

export async function countPendingCaptures(userId: string): Promise<number> {
  return prisma.streamRun.count({
    where: {
      userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });
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
