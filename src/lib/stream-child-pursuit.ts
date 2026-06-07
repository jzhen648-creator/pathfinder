import { z } from "zod";
import type { BloomStatus } from "@prisma/client";
import { generateJsonCompletion } from "@/lib/gemini";
import { getLifeArea } from "@/lib/life-areas";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import { prisma } from "@/lib/prisma";
import { activateHubForUser } from "@/lib/system-hubs";
import { queueMemoryUpdateAfterStream } from "@/lib/memory/queue-memory-update";
import { assignPursuitIconSafe } from "@/lib/ai/assign-pursuit-icon";
import { loadPursuitStreamContext } from "@/lib/stream-pursuit-extract";
import type { PursuitStreamApplyResult } from "@/lib/stream-pursuit-apply";
import type { StreamRunAppliedItem } from "@/types/stream";

const RUN_TTL_MS = 24 * 60 * 60 * 1000;

const childPursuitProposalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1200).optional().default(""),
  why: z.string().trim().max(600).optional().default(""),
  milestones: z.array(z.string().trim().min(1).max(120)).max(8).optional().default([]),
});

export type ChildPursuitProposal = z.infer<typeof childPursuitProposalSchema>;

const CHILD_PURSUIT_SYSTEM_PROMPT = [
  "You help the user create a NEW child pursuit that branches from (follows on from, or is unlocked by) an existing parent pursuit.",
  "This is an INTENTIONAL creation flow: the user is deliberately creating a new, distinct pursuit — NOT a note or context update on the parent.",
  "",
  "Return STRICT JSON only, shape:",
  '{ "title": string, "description": string, "why": string, "milestones": string[] }',
  "",
  "Field rules:",
  "- title: concise, specific, action-oriented title for the NEW pursuit (≈3–10 words). It must describe a new pursuit, not restate the parent. If the input names a concrete next goal (e.g. \"purchase a shared ownership property in London\"), the title should capture that goal (e.g. \"Purchase shared ownership property in London\").",
  "- description: 1–3 plain sentences (second person) describing the new pursuit and what success looks like.",
  "- why: 1–2 sentences explaining how this new pursuit follows from / is unlocked by the parent pursuit. Ground it in the parent and the user's input; do not invent unrelated facts.",
  "- milestones: 3–6 concrete, ordered first steps for the NEW pursuit as short imperative phrases. Each is a distinct action.",
  "",
  "Never merely echo the parent pursuit. Never output anything except the JSON object.",
].join("\n");

export async function runChildPursuitExtract(
  parent: {
    pursuitTitle: string;
    pursuitDescription: string;
    themeLabel: string;
    hubLabel: string;
    milestones: Array<{ title: string; completed: boolean }>;
  },
  input: string,
): Promise<ChildPursuitProposal> {
  const parentMilestones =
    parent.milestones.length > 0
      ? parent.milestones
          .map((m) => `- ${m.title}${m.completed ? " (done)" : ""}`)
          .join("\n")
      : "- (none yet)";

  const user = [
    "PARENT PURSUIT",
    `Title: ${parent.pursuitTitle}`,
    `Context: ${parent.pursuitDescription || "(empty)"}`,
    `Theme: ${parent.themeLabel}    Hub: ${parent.hubLabel}`,
    "Parent milestones:",
    parentMilestones,
    "",
    "The user wants to create a child pursuit that follows from this parent pursuit.",
    "User input:",
    input.trim(),
    "",
    "Produce the new child pursuit as JSON.",
  ].join("\n");

  const raw = await generateJsonCompletion({
    system: CHILD_PURSUIT_SYSTEM_PROMPT,
    user,
    maxTokens: 900,
    temperature: 0.3,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not understand the child pursuit. Try rephrasing.");
  }

  const result = childPursuitProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Could not build a child pursuit from that input.");
  }

  const dedupedMilestones: string[] = [];
  const seen = new Set<string>();
  for (const m of result.data.milestones) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedMilestones.push(m);
  }

  return { ...result.data, milestones: dedupedMilestones };
}

/** Compose the child pursuit description with an explicit, visible parent backref. */
export function composeChildPursuitDescription(
  proposal: ChildPursuitProposal,
  parentTitle: string,
): string {
  const parts: string[] = [];
  if (proposal.description.trim()) parts.push(proposal.description.trim());
  if (proposal.why.trim()) parts.push(proposal.why.trim());
  const body = parts.join(" ").trim();
  const backref = `↳ Follows from: ${parentTitle.trim()}`;
  return body ? `${body}\n\n${backref}` : backref;
}

export async function applyChildPursuitStream(
  userId: string,
  parentPursuitId: string,
  input: string,
  inputMode: "text" | "voice" = "text",
): Promise<PursuitStreamApplyResult> {
  const ctx = await loadPursuitStreamContext(userId, parentPursuitId);
  if (!ctx) {
    return {
      ok: false,
      streamRunId: "",
      rawInput: input,
      error: "Parent pursuit not found",
      status: 404,
    };
  }

  const parentRow = await prisma.goal.findFirst({
    where: { id: parentPursuitId, userId },
    select: { description: true, bloomStatus: true, branchId: true },
  });
  if (!parentRow?.branchId) {
    return {
      ok: false,
      streamRunId: "",
      rawInput: input,
      error: "Parent pursuit not found",
      status: 404,
    };
  }

  const expiresAt = new Date(Date.now() + RUN_TTL_MS);
  let run: { id: string; rawInput: string };
  try {
    run = await prisma.streamRun.create({
      data: {
        userId,
        goalId: parentPursuitId,
        branchId: ctx.branchId,
        limbId: ctx.limbId,
        rawInput: input.trim().slice(0, 4000),
        inputMode,
        status: "pending",
        // Parent is not modified by this flow — store its current values so undo is a no-op on the parent.
        previousDescription: parentRow.description,
        previousBloomStatus: parentRow.bloomStatus,
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

  let proposal: ChildPursuitProposal;
  try {
    proposal = await runChildPursuitExtract(
      {
        pursuitTitle: ctx.pursuitTitle,
        pursuitDescription: ctx.pursuitDescription,
        themeLabel: ctx.themeLabel,
        hubLabel: ctx.hubLabel,
        milestones: ctx.milestones,
      },
      input,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extract failed";
    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "failed", summaryJson: { error: message } },
    });
    return { ok: false, streamRunId: run.id, rawInput: run.rawInput, error: message, status: 503 };
  }

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

  const lifeArea = getLifeArea(ctx.limbId)?.label ?? "Other";
  const now = new Date();
  const items: StreamRunAppliedItem[] = [];
  let createdGoalId = "";
  const description = composeChildPursuitDescription(proposal, ctx.pursuitTitle);
  const iconName = (
    await assignPursuitIconSafe({
      title: proposal.title,
      description,
      lifeArea,
    })
  ).iconName;

  try {
    await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: ctx.branchId, userId },
        select: { id: true, limbId: true },
      });
      if (!branch) throw new Error("Hub not found");

      const child = await tx.goal.create({
        data: {
          userId,
          title: proposal.title,
          description,
          iconName,
          lifeArea,
          goalType: "project",
          branchId: branch.id,
          limbId: branch.limbId,
          significance: 3,
          bloomStatus: "ACTIVE",
          aiGenerated: false,
          future: true,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          // Fallback 2B: no parentGoalId so the child renders as a visible sibling.
          // The parent link lives in the description backref until nested rendering ships.
          sourceStreamRunId: run.id,
        },
      });
      createdGoalId = child.id;

      let position = 0;
      let milestoneCount = 0;
      for (const title of proposal.milestones) {
        const created = await tx.milestone.create({
          data: {
            goalId: child.id,
            title,
            description: "",
            position,
            sourceStreamRunId: run.id,
          },
        });
        position += 1;
        milestoneCount += 1;
        items.unshift({ kind: "milestone", milestoneId: created.id, title: created.title });
      }

      items.unshift({
        kind: "pursuit",
        createdGoalId: child.id,
        title: child.title,
        parentGoalId: parentPursuitId,
        parentTitle: ctx.pursuitTitle,
        milestoneCount,
      });
    });

    void persistGoalShortLabel(createdGoalId).catch(() => {});

    const summary = {
      total: items.length,
      context: 0,
      milestones: items.filter((i) => i.kind === "milestone").length,
      marks: 0,
      status: 0,
    };

    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "applied", summaryJson: { summary, items } },
    });

    queueMemoryUpdateAfterStream(userId, run.rawInput);

    return {
      ok: true,
      streamRunId: run.id,
      rawInput: run.rawInput,
      expiresAt: expiresAt.toISOString(),
      narrativeSentence: proposal.why || "",
      summary,
      items,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create child pursuit";
    await prisma.streamRun.update({
      where: { id: run.id },
      data: { status: "failed", summaryJson: { error: message, items } },
    });
    return { ok: false, streamRunId: run.id, rawInput: run.rawInput, error: message, status: 500 };
  }
}
