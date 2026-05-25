import type { BloomStatus, Prisma } from "@prisma/client";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/branch-sequence";
import { getLifeArea } from "@/lib/life-areas";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { persistGoalShortLabel } from "@/lib/goal-short-label";
import { prisma } from "@/lib/prisma";
import {
  isValidHubSlugForTheme,
  normalizeStreamHubSlug,
  resolveAllHubBranchesForTheme,
  resolveBranchForHub,
} from "@/lib/resolve-hub-branch";
import { activateHubForUser } from "@/lib/system-hubs";
import { recordStreamThemeSession } from "@/lib/stream-theme-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import {
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
} from "@/lib/validation/marks-and-branches";
import type {
  ExtractedMark,
  ExtractedMilestone,
  ExtractedPursuit,
  StreamCommitPayload,
  StreamGlobalCommitPayload,
  StreamMilestoneComplete,
  StreamMilestoneDelete,
  StreamMilestoneUpdate,
  StreamPursuitUpdate,
  StreamThemeCommitPayload,
} from "@/types/stream";

function parseMarkDateYmd(raw: string | null): string {
  if (!raw?.trim()) {
    return new Date().toISOString().slice(0, 10);
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m?.[1] ?? new Date().toISOString().slice(0, 10);
}

function parsePursuitDeadline(raw: string | null | undefined): Date | null {
  if (raw == null || !String(raw).trim()) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw).trim());
  if (!m) return null;
  const resolved = resolveMarkInputDate({ date: m[1] });
  return resolved.ok ? resolved.d : null;
}

function maxMilestonePosition(milestones: { position: number }[]): number {
  return milestones.reduce((acc, m) => Math.max(acc, m.position), -1);
}

function resolveParentGoalId(
  parentRef: ExtractedPursuit["parentRef"],
  hubGoalIds: Set<string>,
  clientKeyToGoalId: Map<string, string>,
): string | null {
  if (!parentRef) return null;
  if (parentRef.kind === "existing") {
    return hubGoalIds.has(parentRef.goalId) ? parentRef.goalId : null;
  }
  return clientKeyToGoalId.get(parentRef.clientKey) ?? null;
}

function buildAllowedPursuitGoalIds(
  hubGoalIds: Set<string>,
  pursuits: ExtractedPursuit[],
  clientKeyToGoalId: Map<string, string>,
): Set<string> {
  const allowed = new Set(hubGoalIds);
  for (const p of pursuits) {
    if (p.existingGoalId) allowed.add(p.existingGoalId);
  }
  for (const id of clientKeyToGoalId.values()) {
    allowed.add(id);
  }
  return allowed;
}

/** Drop or rewrite milestones whose pursuit ref cannot attach on this branch. */
function resolveMilestonesForBranch(
  milestones: ExtractedMilestone[],
  pursuits: ExtractedPursuit[],
  allowed: Set<string>,
  clientKeyToGoalId: Map<string, string>,
): ExtractedMilestone[] {
  const out: ExtractedMilestone[] = [];
  for (const ms of milestones) {
    if (ms.pursuitRef.kind === "new") {
      const key = ms.pursuitRef.clientKey;
      if (pursuits.some((p) => p.clientKey === key) || clientKeyToGoalId.has(key)) {
        out.push(ms);
      } else {
        console.warn("[stream-commit] skipping milestone — unknown clientKey pursuit", ms.title, key);
      }
      continue;
    }

    const goalId = ms.pursuitRef.goalId;
    if (allowed.has(goalId)) {
      out.push(ms);
      continue;
    }

    console.warn("[stream-commit] skipping milestone — unknown pursuit", ms.title, goalId);
  }
  return out;
}

/** Parents and existing-hub children first; session children after clientKey map is populated. */
function partitionNewPursuits(pursuits: ExtractedPursuit[]): {
  firstPass: ExtractedPursuit[];
  deferred: ExtractedPursuit[];
} {
  const firstPass: ExtractedPursuit[] = [];
  const deferred: ExtractedPursuit[] = [];
  for (const p of pursuits) {
    if (p.existingGoalId) continue;
    if (p.parentRef?.kind === "new") {
      deferred.push(p);
    } else {
      firstPass.push(p);
    }
  }
  return { firstPass, deferred };
}

type TxClient = Prisma.TransactionClient;

type BranchRow = { id: string; limbId: string; isActive: boolean };

type HubCommitCounts = {
  createdMarks: number;
  createdPursuits: number;
  bloomedPursuits: number;
  createdMilestones: number;
  goalsNeedingRecompute: Set<string>;
  goalsNeedingShortLabel: Set<string>;
};

type OperationCommitCounts = {
  updatedPursuits: number;
  updatedMilestones: number;
  completedMilestones: number;
  deletedMilestones: number;
  goalsNeedingRecompute: Set<string>;
  goalsNeedingShortLabel: Set<string>;
};

async function persistShortLabelsForGoals(goalIds: Iterable<string>): Promise<void> {
  for (const goalId of goalIds) {
    try {
      await persistGoalShortLabel(goalId);
    } catch (e) {
      console.error("[stream-commit] persistGoalShortLabel failed", goalId, e);
    }
  }
}

type CommitResult =
  | {
      ok: true;
      branchId: string;
      createdMarks: number;
      createdPursuits: number;
      bloomedPursuits: number;
      createdMilestones: number;
    }
  | { ok: false; error: string; status: number };

type ThemeCommitResult =
  | {
      ok: true;
      themeId: string;
      branchIds: string[];
      createdMarks: number;
      createdPursuits: number;
      bloomedPursuits: number;
      createdMilestones: number;
    }
  | { ok: false; error: string; status: number };

type GlobalCommitResult =
  | {
      ok: true;
      branchIds: string[];
      createdMarks: number;
      createdPursuits: number;
      bloomedPursuits: number;
      createdMilestones: number;
      updatedPursuits: number;
      updatedMilestones: number;
      completedMilestones: number;
      deletedMilestones: number;
    }
  | { ok: false; error: string; status: number };

async function commitItemsToBranchInTx(
  tx: TxClient,
  userId: string,
  branch: BranchRow,
  marks: ExtractedMark[],
  pursuits: ExtractedPursuit[],
  milestones: ExtractedMilestone[],
  clientKeyToGoalId: Map<string, string>,
): Promise<HubCommitCounts> {
  const hubGoals = await tx.goal.findMany({
    where: {
      userId,
      branchId: branch.id,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: { id: true, goalType: true, bloomStatus: true },
  });
  const hubGoalIds = new Set(hubGoals.map((g) => g.id));
  const currentBloomByGoalId = new Map(hubGoals.map((g) => [g.id, g.bloomStatus]));

  for (const p of pursuits) {
    if (p.existingGoalId && !hubGoalIds.has(p.existingGoalId)) {
      throw new Error("Invalid existing pursuit on this hub");
    }
  }

  const allowedPursuitIds = buildAllowedPursuitGoalIds(hubGoalIds, pursuits, clientKeyToGoalId);
  const milestonesToCreate = resolveMilestonesForBranch(
    milestones,
    pursuits,
    allowedPursuitIds,
    clientKeyToGoalId,
  );

  const lifeArea = getLifeArea(branch.limbId)?.label ?? "Other";
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const forceBloomedGoalIds = new Set<string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();

  let createdMarks = 0;
  let createdPursuits = 0;
  let bloomedPursuits = 0;
  let createdMilestones = 0;

  const appendAnchor = { kind: "append" as const };

  const nextSequencePosition = async () => {
    const nodes = await loadBranchSequencedNodes(tx, branch.id);
    const resolution = resolveSequenceAnchor(nodes, appendAnchor);
    await applySequenceResolution(tx, resolution);
    return resolution.sequencePosition;
  };

  const createNewPursuit = async (p: ExtractedPursuit, parentGoalId: string | null) => {
    const title = p.title.trim();
    if (!title) return;
    const description = p.description?.trim() ?? "";

    const bloomStatus = p.bloomStatus as BloomStatus;
    const isChild = parentGoalId != null;
    const sequencePosition = isChild ? null : await nextSequencePosition();

    const goal = await tx.goal.create({
      data: {
        userId,
        title,
        description,
        lifeArea,
        goalType: p.goalType,
        branchId: branch.id,
        limbId: branch.limbId,
        deadline: parsePursuitDeadline(p.deadline),
        significance: 3,
        bloomStatus: bloomStatus === "COMPLETE" ? "COMPLETE" : "ACTIVE",
        aiGenerated: false,
        future: true,
        year: defaultYear,
        month: defaultMonth,
        sequencePosition,
        parentGoalId,
        ...(bloomStatus === "COMPLETE" ? { bloomedAt: new Date() } : {}),
      },
    });

    createdPursuits += 1;
    if (bloomStatus === "COMPLETE") {
      forceBloomedGoalIds.add(goal.id);
    }
    if (p.clientKey) {
      clientKeyToGoalId.set(p.clientKey, goal.id);
    }
    hubGoalIds.add(goal.id);
    goalsNeedingShortLabel.add(goal.id);
  };

  for (const p of pursuits) {
    if (!p.existingGoalId) continue;

    const goalId = p.existingGoalId;
    const title = p.title.trim();
    const parentGoalId = resolveParentGoalId(p.parentRef, hubGoalIds, clientKeyToGoalId);
    const updateData: {
      title?: string;
      bloomStatus?: BloomStatus;
      bloomedAt?: Date;
      parentGoalId?: string | null;
      sequencePosition?: null;
    } = {};

    const currentBloom = currentBloomByGoalId.get(goalId);
    if (currentBloom === "ACTIVE" || currentBloom === "ON_HOLD") {
      if (p.bloomStatus === "COMPLETE") {
        updateData.bloomStatus = "COMPLETE";
        updateData.bloomedAt = new Date();
        forceBloomedGoalIds.add(goalId);
        bloomedPursuits += 1;
      } else if (p.bloomStatus === "ON_HOLD") {
        updateData.bloomStatus = "ON_HOLD";
      } else if (p.bloomStatus === "ACTIVE") {
        updateData.bloomStatus = "ACTIVE";
      }
    }

    if (title) {
      updateData.title = title;
      goalsNeedingShortLabel.add(goalId);
    }
    if (
      p.parentRef &&
      parentGoalId &&
      parentGoalId !== goalId &&
      p.bloomStatus !== "COMPLETE" &&
      p.bloomStatus !== "ON_HOLD"
    ) {
      updateData.parentGoalId = parentGoalId;
      updateData.sequencePosition = null;
    }

    if (Object.keys(updateData).length > 0) {
      await tx.goal.update({
        where: { id: goalId },
        data: updateData,
      });
    }

    if (p.bloomStatus === "ACTIVE" && !forceBloomedGoalIds.has(goalId)) {
      goalsNeedingRecompute.add(goalId);
    }
  }

  const { firstPass, deferred } = partitionNewPursuits(pursuits);

  for (const p of firstPass) {
    const parentGoalId = resolveParentGoalId(p.parentRef, hubGoalIds, clientKeyToGoalId);
    await createNewPursuit(p, parentGoalId);
  }

  for (const goalId of clientKeyToGoalId.values()) {
    hubGoalIds.add(goalId);
  }

  let pending = [...deferred];
  while (pending.length > 0) {
    const next: ExtractedPursuit[] = [];
    let progressed = false;
    for (const p of pending) {
      const parentGoalId = resolveParentGoalId(p.parentRef, hubGoalIds, clientKeyToGoalId);
      if (p.parentRef?.kind === "new" && !parentGoalId) {
        next.push(p);
        continue;
      }
      progressed = true;
      await createNewPursuit(p, parentGoalId);
    }
    if (!progressed) {
      for (const p of next) {
        await createNewPursuit(p, null);
      }
      break;
    }
    pending = next;
  }

  for (const mark of marks) {
    const title = displayMarkTitleFromInput(mark.title, undefined);
    if (!title) continue;

    const dateStr = parseMarkDateYmd(mark.date);
    const resolved = resolveMarkInputDate({ date: dateStr });
    if (!resolved.ok) continue;
    if (isMarkDateInTheFuture(resolved.d)) continue;

    const sequencePosition = await nextSequencePosition();
    await tx.mark.create({
      data: {
        userId,
        branchId: branch.id,
        limbId: branch.limbId,
        title,
        description: null,
        date: resolved.d,
        sentiment: "positive",
        archived: false,
        sequencePosition,
        kind: "stream",
      },
    });
    createdMarks += 1;
  }

  for (const ms of milestonesToCreate) {
    const title = ms.title.trim();
    if (!title) continue;

    const goalId =
      ms.pursuitRef.kind === "existing"
        ? ms.pursuitRef.goalId
        : (clientKeyToGoalId.get(ms.pursuitRef.clientKey) ?? null);

    if (!goalId) continue;

    const goal = await tx.goal.findFirst({
      where: { id: goalId, userId, branchId: branch.id },
      select: { id: true, goalType: true },
    });
    if (!goal || goal.goalType === "moment" || goal.goalType === "event") continue;
    if (goal.goalType === "practice" || goal.goalType === "identity") continue;

    const rows = await tx.milestone.findMany({
      where: { goalId },
      select: { position: true },
    });
    const insertPosition = maxMilestonePosition(rows) + 1;

    await tx.milestone.create({
      data: {
        goalId,
        title,
        description: "",
        position: insertPosition,
      },
    });
    createdMilestones += 1;
    if (!forceBloomedGoalIds.has(goalId)) {
      goalsNeedingRecompute.add(goalId);
    }
  }

  return {
    createdMarks,
    createdPursuits,
    bloomedPursuits,
    createdMilestones,
    goalsNeedingRecompute,
    goalsNeedingShortLabel,
  };
}

function parseOperationDate(raw: string | null | undefined): Date {
  const ymd = parseMarkDateYmd(raw ?? null);
  return new Date(`${ymd}T00:00:00.000Z`);
}

async function assertMilestoneTarget(
  tx: TxClient,
  userId: string,
  op: StreamMilestoneUpdate | StreamMilestoneComplete | StreamMilestoneDelete,
): Promise<{ goalId: string; milestoneId: string }> {
  const row = await tx.milestone.findFirst({
    where: {
      id: op.milestoneId,
      goalId: op.goalId,
      goal: {
        userId,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
      },
    },
    select: { id: true, goalId: true },
  });
  if (!row) {
    throw new Error("Invalid milestone operation target");
  }
  return { goalId: row.goalId, milestoneId: row.id };
}

async function applyStreamOperationsInTx(
  tx: TxClient,
  userId: string,
  operations: {
    pursuitUpdates: StreamPursuitUpdate[];
    milestoneUpdates: StreamMilestoneUpdate[];
    milestoneCompletions: StreamMilestoneComplete[];
    milestoneDeletes: StreamMilestoneDelete[];
  },
): Promise<OperationCommitCounts> {
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();
  let updatedPursuits = 0;
  let updatedMilestones = 0;
  let completedMilestones = 0;
  let deletedMilestones = 0;

  for (const op of operations.pursuitUpdates) {
    const goal = await tx.goal.findFirst({
      where: {
        id: op.goalId,
        userId,
        archived: false,
        goalType: { notIn: ["moment", "event"] },
      },
      select: { id: true },
    });
    if (!goal) {
      throw new Error("Invalid pursuit operation target");
    }

    const data: {
      title?: string;
      bloomStatus?: BloomStatus;
      bloomedAt?: Date | null;
    } = {};
    if (op.title?.trim()) {
      data.title = op.title.trim();
      goalsNeedingShortLabel.add(op.goalId);
    }
    if (op.bloomStatus) {
      data.bloomStatus = op.bloomStatus as BloomStatus;
      data.bloomedAt = op.bloomStatus === "COMPLETE" ? new Date() : null;
    }
    if (Object.keys(data).length === 0) continue;

    await tx.goal.update({ where: { id: op.goalId }, data });
    updatedPursuits += 1;
    if (op.bloomStatus === "ACTIVE") {
      goalsNeedingRecompute.add(op.goalId);
    }
  }

  for (const op of operations.milestoneUpdates) {
    const target = await assertMilestoneTarget(tx, userId, op);
    await tx.milestone.update({
      where: { id: target.milestoneId },
      data: { title: op.title.trim() },
    });
    updatedMilestones += 1;
  }

  for (const op of operations.milestoneCompletions) {
    const target = await assertMilestoneTarget(tx, userId, op);
    await tx.milestone.update({
      where: { id: target.milestoneId },
      data: { completedAt: parseOperationDate(op.completedAt) },
    });
    completedMilestones += 1;
    goalsNeedingRecompute.add(target.goalId);
  }

  for (const op of operations.milestoneDeletes) {
    const target = await assertMilestoneTarget(tx, userId, op);
    await tx.milestone.delete({ where: { id: target.milestoneId } });
    deletedMilestones += 1;
    goalsNeedingRecompute.add(target.goalId);
  }

  return {
    updatedPursuits,
    updatedMilestones,
    completedMilestones,
    deletedMilestones,
    goalsNeedingRecompute,
    goalsNeedingShortLabel,
  };
}

export async function commitStreamToHub(
  userId: string,
  payload: StreamCommitPayload,
): Promise<CommitResult> {
  const branch = await prisma.branch.findFirst({
    where: { id: payload.hubId, userId },
    select: { id: true, limbId: true, isActive: true },
  });
  if (!branch) {
    return { ok: false, error: "Hub not found", status: 404 };
  }

  if (!branch.isActive) {
    await activateHubForUser(prisma, userId, branch.id);
  }

  const marks: ExtractedMark[] = [...payload.marks];
  const pursuits: ExtractedPursuit[] = [...payload.pursuits];

  for (const amb of payload.resolvedAmbiguous) {
    const label = amb.label.trim();
    if (!label) continue;
    if (amb.resolution === "done") {
      marks.push({ title: label, date: null });
    } else if (amb.resolution === "in_progress") {
      pursuits.push({ title: label, goalType: "project", bloomStatus: "ACTIVE" });
    } else {
      pursuits.push({ title: label, goalType: "project", bloomStatus: "ACTIVE" });
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();

  let createdMarks = 0;
  let createdPursuits = 0;
  let bloomedPursuits = 0;
  let createdMilestones = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const counts = await commitItemsToBranchInTx(
        tx,
        userId,
        branch,
        marks,
        pursuits,
        payload.milestones,
        clientKeyToGoalId,
      );
      createdMarks = counts.createdMarks;
      createdPursuits = counts.createdPursuits;
      bloomedPursuits = counts.bloomedPursuits;
      createdMilestones = counts.createdMilestones;
      for (const id of counts.goalsNeedingRecompute) {
        goalsNeedingRecompute.add(id);
      }
      for (const id of counts.goalsNeedingShortLabel) {
        goalsNeedingShortLabel.add(id);
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalBloomStatus(goalId);
      } catch (e) {
        console.error("[commitStreamToHub] recomputeGoalBloomStatus failed", goalId, e);
      }
    }

    await persistShortLabelsForGoals(goalsNeedingShortLabel);

    return {
      ok: true,
      branchId: branch.id,
      createdMarks,
      createdPursuits,
      bloomedPursuits,
      createdMilestones,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save stream to tree";
    console.error("[commitStreamToHub]", e);
    const status = msg.includes("Invalid") || msg.includes("unknown") ? 400 : 500;
    return { ok: false, error: msg, status };
  }
}

function groupByHubSlug<T extends { hubId?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.hubId?.trim()) continue;
    const slug = normalizeStreamHubSlug(item.hubId);
    const list = map.get(slug) ?? [];
    list.push(item);
    map.set(slug, list);
  }
  return map;
}

function groupByBranchId<T extends { hubId?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const branchId = item.hubId?.trim();
    if (!branchId) continue;
    const list = map.get(branchId) ?? [];
    list.push(item);
    map.set(branchId, list);
  }
  return map;
}

function resolveThemeForHubSlug(preferredThemeId: LifeAreaId, slug: string): LifeAreaId | null {
  if (isValidHubSlugForTheme(preferredThemeId, slug)) return preferredThemeId;
  for (const candidate of LIFE_AREA_IDS) {
    if (isValidHubSlugForTheme(candidate, slug)) return candidate;
  }
  return null;
}

async function alignThemeMilestoneHubIds(
  userId: string,
  themeId: LifeAreaId,
  milestones: ExtractedMilestone[],
): Promise<ExtractedMilestone[]> {
  const existingGoalIds = milestones
    .filter((ms): ms is ExtractedMilestone & { pursuitRef: { kind: "existing"; goalId: string } } =>
      ms.pursuitRef.kind === "existing",
    )
    .map((ms) => ms.pursuitRef.goalId);
  if (existingGoalIds.length === 0) return milestones;

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: existingGoalIds } },
    select: { id: true, branchId: true },
  });
  const hubBranches = await resolveAllHubBranchesForTheme(prisma, userId, themeId);
  const slugByBranchId = new Map(hubBranches.map((h) => [h.branchId, h.hubSlug]));
  const hubByGoalId = new Map(
    goals.map((g) => [g.id, g.branchId ? slugByBranchId.get(g.branchId) : undefined]),
  );

  return milestones.map((ms) => {
    if (ms.pursuitRef.kind !== "existing") return ms;
    const hubId = hubByGoalId.get(ms.pursuitRef.goalId);
    if (!hubId) return ms;
    return { ...ms, hubId };
  });
}

export async function commitStreamToTheme(
  userId: string,
  payload: StreamThemeCommitPayload,
): Promise<ThemeCommitResult> {
  const themeId = payload.themeId as LifeAreaId;
  if (!getLifeArea(themeId)) {
    return { ok: false, error: "Unknown theme", status: 400 };
  }

  const alignedMilestones = await alignThemeMilestoneHubIds(userId, themeId, payload.milestones);

  const marksByHub = groupByHubSlug(payload.marks);
  const pursuitsByHub = groupByHubSlug(payload.pursuits);
  const milestonesByHub = groupByHubSlug(alignedMilestones);

  const allSlugs = new Set([
    ...marksByHub.keys(),
    ...pursuitsByHub.keys(),
    ...milestonesByHub.keys(),
  ]);

  const branchBySlug = new Map<string, BranchRow>();
  for (const slug of allSlugs) {
    const targetThemeId = resolveThemeForHubSlug(themeId, slug);
    if (!targetThemeId) {
      return { ok: false, error: `Unknown hub "${slug}"`, status: 400 };
    }
    const resolved = await resolveBranchForHub(prisma, userId, targetThemeId, slug);
    if (!resolved) {
      return { ok: false, error: `Hub branch not found for "${slug}"`, status: 404 };
    }
    branchBySlug.set(slug, {
      id: resolved.branchId,
      limbId: resolved.limbId,
      isActive: true,
    });
  }

  for (const branch of branchBySlug.values()) {
    const row = await prisma.branch.findFirst({
      where: { id: branch.id, userId },
      select: { isActive: true },
    });
    if (row && !row.isActive) {
      await activateHubForUser(prisma, userId, branch.id);
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();

  let createdMarks = 0;
  let createdPursuits = 0;
  let bloomedPursuits = 0;
  let createdMilestones = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const slug of allSlugs) {
        const branch = branchBySlug.get(slug)!;
        const counts = await commitItemsToBranchInTx(
          tx,
          userId,
          branch,
          marksByHub.get(slug) ?? [],
          pursuitsByHub.get(slug) ?? [],
          milestonesByHub.get(slug) ?? [],
          clientKeyToGoalId,
        );
        createdMarks += counts.createdMarks;
        createdPursuits += counts.createdPursuits;
        bloomedPursuits += counts.bloomedPursuits;
        createdMilestones += counts.createdMilestones;
        for (const id of counts.goalsNeedingRecompute) {
          goalsNeedingRecompute.add(id);
        }
        for (const id of counts.goalsNeedingShortLabel) {
          goalsNeedingShortLabel.add(id);
        }
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalBloomStatus(goalId);
      } catch (e) {
        console.error("[commitStreamToTheme] recomputeGoalBloomStatus failed", goalId, e);
      }
    }

    await persistShortLabelsForGoals(goalsNeedingShortLabel);

    await recordStreamThemeSession(prisma, userId, themeId, {
      inputText: payload.inputText,
      inputMode: payload.inputMode,
      itemsAdded: payload.itemsAdded,
      itemsSkipped: payload.itemsSkipped,
    });

    return {
      ok: true,
      themeId,
      branchIds: [...branchBySlug.values()].map((b) => b.id),
      createdMarks,
      createdPursuits,
      bloomedPursuits,
      createdMilestones,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save stream to tree";
    console.error("[commitStreamToTheme]", e);
    const status = msg.includes("Invalid") || msg.includes("unknown") ? 400 : 500;
    return { ok: false, error: msg, status };
  }
}

export async function commitStreamGlobal(
  userId: string,
  payload: StreamGlobalCommitPayload,
): Promise<GlobalCommitResult> {
  const marksByBranch = groupByBranchId(payload.marks);
  const pursuitsByBranch = groupByBranchId(payload.pursuits);
  const milestonesByBranch = groupByBranchId(payload.milestones);
  const allBranchIds = new Set([
    ...marksByBranch.keys(),
    ...pursuitsByBranch.keys(),
    ...milestonesByBranch.keys(),
  ]);

  const branches = await prisma.branch.findMany({
    where: { id: { in: [...allBranchIds] }, userId },
    select: { id: true, limbId: true, isActive: true },
  });
  const branchById = new Map(branches.map((b) => [b.id, b]));
  for (const branchId of allBranchIds) {
    if (!branchById.has(branchId)) {
      return { ok: false, error: `Hub branch not found for "${branchId}"`, status: 404 };
    }
  }

  for (const branch of branchById.values()) {
    if (!branch.isActive) {
      await activateHubForUser(prisma, userId, branch.id);
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();

  let createdMarks = 0;
  let createdPursuits = 0;
  let bloomedPursuits = 0;
  let createdMilestones = 0;
  let updatedPursuits = 0;
  let updatedMilestones = 0;
  let completedMilestones = 0;
  let deletedMilestones = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const branchId of allBranchIds) {
        const branch = branchById.get(branchId)!;
        const counts = await commitItemsToBranchInTx(
          tx,
          userId,
          branch,
          marksByBranch.get(branchId) ?? [],
          pursuitsByBranch.get(branchId) ?? [],
          milestonesByBranch.get(branchId) ?? [],
          clientKeyToGoalId,
        );
        createdMarks += counts.createdMarks;
        createdPursuits += counts.createdPursuits;
        bloomedPursuits += counts.bloomedPursuits;
        createdMilestones += counts.createdMilestones;
        for (const id of counts.goalsNeedingRecompute) {
          goalsNeedingRecompute.add(id);
        }
        for (const id of counts.goalsNeedingShortLabel) {
          goalsNeedingShortLabel.add(id);
        }
      }

      const opCounts = await applyStreamOperationsInTx(tx, userId, {
        pursuitUpdates: payload.pursuitUpdates,
        milestoneUpdates: payload.milestoneUpdates,
        milestoneCompletions: payload.milestoneCompletions,
        milestoneDeletes: payload.milestoneDeletes,
      });
      updatedPursuits = opCounts.updatedPursuits;
      updatedMilestones = opCounts.updatedMilestones;
      completedMilestones = opCounts.completedMilestones;
      deletedMilestones = opCounts.deletedMilestones;
      for (const id of opCounts.goalsNeedingRecompute) {
        goalsNeedingRecompute.add(id);
      }
      for (const id of opCounts.goalsNeedingShortLabel) {
        goalsNeedingShortLabel.add(id);
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalBloomStatus(goalId);
      } catch (e) {
        console.error("[commitStreamGlobal] recomputeGoalBloomStatus failed", goalId, e);
      }
    }

    await persistShortLabelsForGoals(goalsNeedingShortLabel);

    return {
      ok: true,
      branchIds: [...allBranchIds],
      createdMarks,
      createdPursuits,
      bloomedPursuits,
      createdMilestones,
      updatedPursuits,
      updatedMilestones,
      completedMilestones,
      deletedMilestones,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save stream to tree";
    console.error("[commitStreamGlobal]", e);
    const status = msg.includes("Invalid") || msg.includes("unknown") ? 400 : 500;
    return { ok: false, error: msg, status };
  }
}
