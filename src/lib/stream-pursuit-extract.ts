import { getLifeArea } from "@/lib/life-areas";
import { canonicalHubDisplayLabel } from "@/lib/hub-catalog";
import { prisma } from "@/lib/prisma";
import {
  buildStreamHubContextInput,
  formatPreviousStreamSessionSummary,
  runStreamExtract,
} from "@/lib/ai/stream-extract";
import type { StreamHubContextInput } from "@/types/stream";
import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import type { StreamExtractResponse } from "@/types/stream";

export type PursuitStreamContext = {
  goalId: string;
  branchId: string;
  limbId: string;
  pursuitTitle: string;
  pursuitDescription: string;
  hubLabel: string;
  themeLabel: string;
  milestones: Array<{ id: string; title: string; completed: boolean }>;
};

export async function loadPursuitStreamContext(
  userId: string,
  pursuitId: string,
): Promise<PursuitStreamContext | null> {
  const goal = await prisma.goal.findFirst({
    where: {
      id: pursuitId,
      userId,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: {
      id: true,
      title: true,
      description: true,
      branchId: true,
      limbId: true,
      milestones: {
        select: { id: true, title: true, completedAt: true },
        orderBy: { position: "asc" },
      },
      branch: { select: { id: true, label: true, name: true, limbId: true } },
    },
  });
  if (!goal?.branchId) return null;

  const limbId = goal.limbId ?? goal.branch?.limbId ?? "becoming";
  const hubLabel = canonicalHubDisplayLabel(
    limbId,
    goal.branch?.label ?? goal.branch?.name ?? goal.branchId,
  );

  return {
    goalId: goal.id,
    branchId: goal.branchId,
    limbId,
    pursuitTitle: goal.title,
    pursuitDescription: goal.description?.trim() ?? "",
    hubLabel,
    themeLabel: getLifeArea(limbId)?.label ?? limbId,
    milestones: goal.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      completed: Boolean(m.completedAt),
    })),
  };
}

const EXPLICIT_COMPLETE =
  /\b(completed?|finished|done with|i'?ve done|i have done|wrapped up|achieved)\b/i;
const EXPLICIT_HOLD =
  /\b(on hold|paused?|shelved|taking a break|put (this |it )?on hold)\b/i;

export function allowPursuitBloomStatus(
  rawInput: string,
  status: string | undefined,
): "ACTIVE" | "ON_HOLD" | "COMPLETE" | undefined {
  if (!status) return undefined;
  if (status === "COMPLETE" && !EXPLICIT_COMPLETE.test(rawInput)) return undefined;
  if (status === "ON_HOLD" && !EXPLICIT_HOLD.test(rawInput)) return undefined;
  return status as "ACTIVE" | "ON_HOLD" | "COMPLETE";
}

/** Keep only updates for this pursuit; never create/archive/delete pursuits. */
export function filterPursuitStreamExtraction(
  extraction: StreamExtractResponse,
  goalId: string,
  rawInput: string,
): StreamExtractResponse {
  const pursuitUpdates = extraction.pursuitUpdates
    .filter((u) => u.goalId === goalId)
    .map((u) => ({
      ...u,
      bloomStatus: allowPursuitBloomStatus(rawInput, u.bloomStatus),
    }))
    .filter((u) => u.description?.trim() || u.title?.trim() || u.bloomStatus);

  const milestones = extraction.milestones.filter(
    (m) => m.pursuitRef.kind === "existing" && m.pursuitRef.goalId === goalId,
  );

  const pursuits = extraction.pursuits
    .filter((p) => p.existingGoalId === goalId)
    .map((p) => ({
      ...p,
      existingGoalId: goalId,
      bloomStatus: allowPursuitBloomStatus(rawInput, p.bloomStatus) ?? p.bloomStatus,
    }));

  return {
    ...extraction,
    pursuits,
    milestones,
    pursuitUpdates,
    milestoneUpdates: [],
    milestoneCompletions: [],
    milestoneDeletes: [],
    ambiguous: [],
  };
}

export async function runPursuitStreamExtract(
  userId: string,
  ctx: PursuitStreamContext,
  input: string,
): Promise<StreamExtractResponse> {
  const branch = await prisma.branch.findFirst({
    where: { id: ctx.branchId, userId },
    select: { id: true, limbId: true, label: true },
  });
  if (!branch) throw new Error("Hub not found");

  const [goals, archivedGoals, marks, archivedMarks, recentStreamMarks] = await Promise.all([
    prisma.goal.findMany({
      where: {
        userId,
        branchId: branch.id,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
      },
      select: {
        id: true,
        title: true,
        goalType: true,
        bloomStatus: true,
        parentGoalId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goal.findMany({
      where: { userId, branchId: branch.id, archived: true, goalType: { notIn: ["moment", "event"] } },
      select: { title: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mark.findMany({
      where: { userId, branchId: branch.id, archived: false },
      select: { title: true, date: true },
      orderBy: { date: "asc" },
    }),
    prisma.mark.findMany({
      where: { userId, branchId: branch.id, archived: true },
      select: { title: true, date: true },
      orderBy: { date: "desc" },
    }),
    prisma.mark.findMany({
      where: { userId, branchId: branch.id, archived: false, kind: "stream" },
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  const hubContext: StreamHubContextInput = buildStreamHubContextInput({
    branchId: branch.id,
    limbId: branch.limbId,
    hubLabel: ctx.hubLabel,
    existingPursuits: goals.map((g) => ({
      goalId: g.id,
      title: g.title,
      goalType: g.goalType,
      bloomStatus: g.bloomStatus,
      parentGoalId: g.parentGoalId ?? null,
    })),
    existingMarks: marks.map((m) => ({
      title: m.title,
      ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
    })),
    removedPursuits: archivedGoals.map((g) => ({ title: g.title })),
    removedMarks: archivedMarks.map((m) => ({
      title: m.title,
      ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
    })),
    previousStreamSessionSummary: formatPreviousStreamSessionSummary(
      [...recentStreamMarks].reverse().map((m) => m.title),
    ),
  });

  const pursuitFocus = [
    "PURSUIT-SCOPED STREAM (single pursuit only):",
    `Target pursuit goalId: ${ctx.goalId}`,
    `Title: ${ctx.pursuitTitle}`,
    `Current context/description: ${ctx.pursuitDescription || "(empty)"}`,
    "Existing milestones:",
    ...(ctx.milestones.length > 0
      ? ctx.milestones.map((m) => `- [${m.id}] ${m.title}${m.completed ? " (done)" : ""}`)
      : ["- (none yet)"]),
    "",
    "Rules for this submission:",
    "- Rewrite or extend the target pursuit context in pursuitUpdates[] with goalId and description (specific, action-oriented).",
    "- Add milestones only for this pursuit (pursuitExistingGoalId = target goalId).",
    "- Optionally add one hub mark for a distinct timeline moment.",
    "- Do NOT create new pursuits. Do NOT delete or archive anything.",
    "- Only set bloomStatus COMPLETE or ON_HOLD if the user clearly finished or paused this pursuit.",
    "",
    "User input:",
    input,
  ].join("\n");

  const [userContext, mapContext] = await Promise.all([
    formatUserContext(userId),
    formatMapContext(userId, { themeId: ctx.limbId, hubId: ctx.branchId, pursuitId: ctx.goalId }),
  ]);

  const result = await runStreamExtract(hubContext, pursuitFocus, {
    userContext,
    mapContext,
  });

  return filterPursuitStreamExtraction(result, ctx.goalId, input);
}
