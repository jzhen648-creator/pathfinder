import type { Prisma, PursuitStatus } from "@prisma/client";

/** Stream must not overwrite terminal or user-set pursuit status values. */
function isStreamProtectedStatus(status: PursuitStatus): boolean {
  return status === "COMPLETE" || status === "MAINTAINING";
}
import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import { getLifeArea } from "@/lib/life-areas";
import { recomputeGoalStatus } from "@/lib/goal-status-recompute";
import { goalAllowsStreamMilestones, normalizeIngestedPursuitType } from "@/lib/goal-type";
import { prisma } from "@/lib/prisma";
import {
  buildCategoryResolver,
  isValidHubSlugForTheme,
  normalizeStreamCategorySlug,
  resolveAllHubBranchesForTheme,
  resolveBranchForHub,
  type CategoryResolver,
} from "@/lib/resolve-category";
import { dedupeDuplicateRootCategories } from "@/lib/category-dedupe";
import { activateCategoryForUser } from "@/lib/system-categories";
import {
  recordStreamGlobalSession,
  recordStreamThemeSession,
} from "@/lib/stream-theme-context";
import { queueMemoryUpdateAfterStream } from "@/lib/memory/queue-memory-update";
import { refreshInsightsInBackground } from "@/lib/insights/refresh-insights-background";
import {
  assignPursuitVisualsSafe,
  persistPursuitVisualsForGoal,
} from "@/lib/ai/assign-pursuit-icon";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import {
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
} from "@/lib/validation/marks-and-categories";
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

type TxClient = Prisma.TransactionClient;

type BranchRow = { id: string; themeId: string; isActive: boolean };

type HubCommitCounts = {
  createdMarks: number;
  createdPursuits: number;
  bloomedPursuits: number;
  createdMilestones: number;
  goalsNeedingRecompute: Set<string>;
  goalsNeedingShortLabel: Set<string>;
  touchedPursuitIds: Set<string>;
};

type OperationCommitCounts = {
  updatedPursuits: number;
  updatedMilestones: number;
  completedMilestones: number;
  deletedMilestones: number;
  goalsNeedingRecompute: Set<string>;
  goalsNeedingShortLabel: Set<string>;
  touchedPursuitIds: Set<string>;
};

async function persistVisualsForGoals(goalIds: Iterable<string>): Promise<void> {
  for (const goalId of goalIds) {
    try {
      await persistPursuitVisualsForGoal(goalId);
    } catch (e) {
      console.error("[stream-commit] persistPursuitVisualsForGoal failed", goalId, e);
    }
  }
}

function refreshInsightsAfterStreamCommit(userId: string, touchedPursuitIds: Set<string>): void {
  const pursuitIds = [...touchedPursuitIds];
  if (pursuitIds.length > 0) {
    refreshInsightsInBackground(userId, { pursuitIds });
    return;
  }
  refreshInsightsInBackground(userId);
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
  pursuits = pursuits.map((p) => {
    const normalized = normalizeIngestedPursuitType(p);
    return {
      ...p,
      goalType: normalized.goalType,
      status: normalized.status as ExtractedPursuit["status"],
    };
  });

  const hubGoals = await tx.goal.findMany({
    where: {
      userId,
      categoryId: branch.id,
      archived: false,
      goalType: { notIn: ["moment", "event"] },
    },
    select: { id: true, goalType: true, status: true },
  });
  const hubGoalIds = new Set(hubGoals.map((g) => g.id));
  const currentBloomByGoalId = new Map(hubGoals.map((g) => [g.id, g.status]));

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

  const lifeArea = getLifeArea(branch.themeId)?.label ?? "Other";
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const forceBloomedGoalIds = new Set<string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();
  const touchedPursuitIds = new Set<string>();

  let createdMarks = 0;
  let createdPursuits = 0;
  let bloomedPursuits = 0;
  let createdMilestones = 0;

  const appendAnchor = { kind: "append" as const };

  const nextSequencePosition = async () => {
    const nodes = await loadCategorySequencedNodes(tx, branch.id);
    const resolution = resolveSequenceAnchor(nodes, appendAnchor);
    await applySequenceResolution(tx, resolution);
    return resolution.sequencePosition;
  };

  const createNewPursuit = async (p: ExtractedPursuit) => {
    const title = p.title.trim();
    if (!title) return;
    const description = p.description?.trim() ?? "";

    const { goalType, status: normalizedStatus } = normalizeIngestedPursuitType(p);
    const pursuitStatus = normalizedStatus as PursuitStatus;
    const sequencePosition = await nextSequencePosition();
    const { iconName, shortLabel } = await assignPursuitVisualsSafe({
      title,
      description,
      lifeArea,
      queueKey: userId,
    });

    const goal = await tx.goal.create({
      data: {
        userId,
        title,
        description,
        iconName,
        shortLabel,
        lifeArea,
        goalType,
        categoryId: branch.id,
        themeId: branch.themeId,
        deadline: parsePursuitDeadline(p.deadline),
        significance: 3,
        status: pursuitStatus,
        aiGenerated: false,
        future: true,
        year: defaultYear,
        month: defaultMonth,
        sequencePosition,
        ...(pursuitStatus === "COMPLETE" ? { completedAt: new Date() } : {}),
      },
    });

    createdPursuits += 1;
    touchedPursuitIds.add(goal.id);
    if (pursuitStatus === "COMPLETE") {
      forceBloomedGoalIds.add(goal.id);
    }
    if (p.clientKey) {
      clientKeyToGoalId.set(p.clientKey, goal.id);
    }
    hubGoalIds.add(goal.id);
  };

  for (const p of pursuits) {
    if (!p.existingGoalId) continue;

    const goalId = p.existingGoalId;
    const title = p.title.trim();
    const updateData: {
      title?: string;
      status?: PursuitStatus;
      completedAt?: Date;
    } = {};

    const currentBloom = currentBloomByGoalId.get(goalId);
    if (currentBloom && !isStreamProtectedStatus(currentBloom)) {
      if (p.status === "COMPLETE") {
        updateData.status = "COMPLETE";
        updateData.completedAt = new Date();
        forceBloomedGoalIds.add(goalId);
        bloomedPursuits += 1;
      } else if (p.status === "PAUSED") {
        updateData.status = "PAUSED";
      } else if (p.status === "MAINTAINING") {
        updateData.status = "MAINTAINING";
      } else if (p.status === "ACTIVE") {
        updateData.status = "ACTIVE";
      }
    }

    if (title) {
      updateData.title = title;
      goalsNeedingShortLabel.add(goalId);
    }

    if (Object.keys(updateData).length > 0) {
      await tx.goal.update({
        where: { id: goalId },
        data: updateData,
      });
      touchedPursuitIds.add(goalId);
    }

    if (p.status === "ACTIVE" && !forceBloomedGoalIds.has(goalId)) {
      goalsNeedingRecompute.add(goalId);
    }
  }

  for (const p of pursuits) {
    if (p.existingGoalId) continue;
    await createNewPursuit(p);
  }

  for (const mark of marks) {
    const title = displayMarkTitleFromInput(mark.title, undefined);
    if (!title) {
      throw new Error("Stream mark is missing a title");
    }

    const dateStr = parseMarkDateYmd(mark.date);
    const resolved = resolveMarkInputDate({ date: dateStr ?? undefined });
    if (!resolved.ok) {
      throw new Error(resolved.message);
    }
    const future = resolved.d ? isMarkDateInTheFuture(resolved.d) : false;

    const sequencePosition = await nextSequencePosition();
    await tx.mark.create({
      data: {
        userId,
        categoryId: branch.id,
        themeId: branch.themeId,
        title,
        description: null,
        date: resolved.d,
        sentiment: "positive",
        archived: false,
        future,
        year: resolved.d?.getUTCFullYear() ?? null,
        month: resolved.d ? resolved.d.getUTCMonth() + 1 : null,
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
      where: { id: goalId, userId, categoryId: branch.id },
      select: { id: true, goalType: true, status: true },
    });
    if (!goal || !goalAllowsStreamMilestones(goal)) continue;

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
    touchedPursuitIds,
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
  const touchedPursuitIds = new Set<string>();
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
      select: { id: true, status: true },
    });
    if (!goal) {
      throw new Error("Invalid pursuit operation target");
    }

    const data: {
      title?: string;
      description?: string;
      status?: PursuitStatus;
      completedAt?: Date | null;
    } = {};
    if (op.title?.trim()) {
      data.title = op.title.trim();
      goalsNeedingShortLabel.add(op.goalId);
    }
    if (op.status && !isStreamProtectedStatus(goal.status)) {
      data.status = op.status as PursuitStatus;
      data.completedAt = op.status === "COMPLETE" ? new Date() : null;
    }
    if (Object.keys(data).length === 0) continue;

    await tx.goal.update({ where: { id: op.goalId }, data });
    updatedPursuits += 1;
    touchedPursuitIds.add(op.goalId);
    if (op.status === "ACTIVE") {
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
    touchedPursuitIds,
  };
}

export async function commitStreamToCategory(
  userId: string,
  payload: StreamCommitPayload,
): Promise<CommitResult> {
  await dedupeDuplicateRootCategories(prisma, userId);
  const resolver = await buildCategoryResolver(prisma, userId);
  const categoryId = resolver.resolve(payload.categoryId);
  if (!categoryId) {
    return { ok: false, error: "Category not found", status: 404 };
  }

  const branch = await prisma.themeCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, themeId: true, isActive: true },
  });
  if (!branch) {
    return { ok: false, error: "Hub not found", status: 404 };
  }

  if (!branch.isActive) {
    await activateCategoryForUser(prisma, userId, branch.id);
  }

  const marks: ExtractedMark[] = [...payload.marks];
  const pursuits: ExtractedPursuit[] = [...payload.pursuits];

  for (const amb of payload.resolvedAmbiguous) {
    const label = amb.label.trim();
    if (!label) continue;
    if (amb.resolution === "done") {
      marks.push({ title: label, date: null });
    } else if (amb.resolution === "in_progress") {
      pursuits.push({ title: label, goalType: "project", status: "ACTIVE" });
    } else {
      pursuits.push({ title: label, goalType: "project", status: "ACTIVE" });
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();
  const touchedPursuitIds = new Set<string>();

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
      for (const id of counts.touchedPursuitIds) {
        touchedPursuitIds.add(id);
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalStatus(goalId);
      } catch (e) {
        console.error("[commitStreamToCategory] recomputeGoalStatus failed", goalId, e);
      }
    }

    await persistVisualsForGoals(goalsNeedingShortLabel);

    refreshInsightsAfterStreamCommit(userId, touchedPursuitIds);

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
    console.error("[commitStreamToCategory]", e);
    const status = msg.includes("Invalid") || msg.includes("unknown") ? 400 : 500;
    return { ok: false, error: msg, status };
  }
}

function groupByCategorySlug<T extends { categorySlug?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.categorySlug?.trim()) continue;
    const slug = normalizeStreamCategorySlug(item.categorySlug);
    const list = map.get(slug) ?? [];
    list.push(item);
    map.set(slug, list);
  }
  return map;
}

function groupByBranchId<T extends { categorySlug?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const branchId = item.categorySlug?.trim();
    if (!branchId) continue;
    const list = map.get(branchId) ?? [];
    list.push(item);
    map.set(branchId, list);
  }
  return map;
}

function hasMissingCategorySlug(items: Array<{ categorySlug?: string }>): boolean {
  return items.some((item) => !item.categorySlug?.trim());
}

function expectedCreatedPursuits(pursuits: ExtractedPursuit[]): number {
  return pursuits.filter((p) => !p.existingGoalId).length;
}

function resolveThemeForHubSlug(preferredThemeId: LifeAreaId, slug: string): LifeAreaId | null {
  if (isValidHubSlugForTheme(preferredThemeId, slug)) return preferredThemeId;
  for (const candidate of LIFE_AREA_IDS) {
    if (isValidHubSlugForTheme(candidate, slug)) return candidate;
  }
  return null;
}

function remapCategoryIdOnItems<T extends { categorySlug?: string }>(
  items: T[],
  resolver: CategoryResolver,
  preferredThemeId?: LifeAreaId,
): T[] {
  return items.map((item) => {
    if (!item.categorySlug?.trim()) return item;
    const resolved = resolver.resolve(item.categorySlug, preferredThemeId);
    return resolved ? { ...item, categorySlug: resolved } : item;
  });
}

function remapCategorySlugOnItems<T extends { categorySlug?: string }>(
  items: T[],
  resolver: CategoryResolver,
  preferredThemeId: LifeAreaId,
): T[] {
  return items.map((item) => {
    if (!item.categorySlug?.trim()) return item;
    const slug = resolver.resolveSlug(item.categorySlug, preferredThemeId);
    return slug ? { ...item, categorySlug: slug } : item;
  });
}

async function alignThemeMilestoneCategorySlugs(
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
    select: { id: true, categoryId: true },
  });
  const hubBranches = await resolveAllHubBranchesForTheme(prisma, userId, themeId);
  const slugByBranchId = new Map(hubBranches.map((h) => [h.categoryId, h.hubSlug]));
  const hubByGoalId = new Map(
    goals.map((g) => [g.id, g.categoryId ? slugByBranchId.get(g.categoryId) : undefined]),
  );

  return milestones.map((ms) => {
    if (ms.pursuitRef.kind !== "existing") return ms;
    const categorySlug = hubByGoalId.get(ms.pursuitRef.goalId);
    if (!categorySlug) return ms;
    return { ...ms, categorySlug };
  });
}

export async function commitStreamToTheme(
  userId: string,
  payload: StreamThemeCommitPayload,
): Promise<ThemeCommitResult> {
  await dedupeDuplicateRootCategories(prisma, userId);
  const resolver = await buildCategoryResolver(prisma, userId);
  const themeId = payload.themeId as LifeAreaId;
  if (!getLifeArea(themeId)) {
    return { ok: false, error: "Unknown theme", status: 400 };
  }

  const marks = remapCategorySlugOnItems(payload.marks, resolver, themeId);
  const pursuits = remapCategorySlugOnItems(payload.pursuits, resolver, themeId);
  const alignedMilestones = await alignThemeMilestoneCategorySlugs(
    userId,
    themeId,
    remapCategorySlugOnItems(payload.milestones, resolver, themeId),
  );

  const marksByHub = groupByCategorySlug(marks);
  const pursuitsByHub = groupByCategorySlug(pursuits);
  const milestonesByHub = groupByCategorySlug(alignedMilestones);

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
    const resolvedId = resolver.resolve(slug, targetThemeId);
    const resolved =
      resolvedId != null
        ? { categoryId: resolvedId, limbId: targetThemeId }
        : await resolveBranchForHub(prisma, userId, targetThemeId, slug);
    if (!resolved) {
      return { ok: false, error: `Hub branch not found for "${slug}"`, status: 404 };
    }
    branchBySlug.set(slug, {
      id: resolved.categoryId,
      themeId: "limbId" in resolved ? resolved.limbId : resolved.themeId,
      isActive: true,
    });
  }

  for (const branch of branchBySlug.values()) {
    const row = await prisma.themeCategory.findFirst({
      where: { id: branch.id, userId },
      select: { isActive: true },
    });
    if (row && !row.isActive) {
      await activateCategoryForUser(prisma, userId, branch.id);
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();
  const touchedPursuitIds = new Set<string>();

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
        for (const id of counts.touchedPursuitIds) {
          touchedPursuitIds.add(id);
        }
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalStatus(goalId);
      } catch (e) {
        console.error("[commitStreamToTheme] recomputeGoalStatus failed", goalId, e);
      }
    }

    await persistVisualsForGoals(goalsNeedingShortLabel);

    await recordStreamThemeSession(prisma, userId, themeId, {
      inputText: payload.inputText,
      inputMode: payload.inputMode,
      itemsAdded: payload.itemsAdded,
      itemsSkipped: payload.itemsSkipped,
    });

    queueMemoryUpdateAfterStream(userId, payload.inputText);

    refreshInsightsAfterStreamCommit(userId, touchedPursuitIds);

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
  await dedupeDuplicateRootCategories(prisma, userId);
  const resolver = await buildCategoryResolver(prisma, userId);
  const marks = remapCategoryIdOnItems(payload.marks, resolver);
  const pursuits = remapCategoryIdOnItems(payload.pursuits, resolver);
  const milestones = remapCategoryIdOnItems(payload.milestones, resolver);

  if (
    hasMissingCategorySlug(marks) ||
    hasMissingCategorySlug(pursuits) ||
    hasMissingCategorySlug(milestones)
  ) {
    return {
      ok: false,
      error: "Choose a hub for each new mark, pursuit, and milestone before saving.",
      status: 400,
    };
  }

  const marksByBranch = groupByBranchId(marks);
  const pursuitsByBranch = groupByBranchId(pursuits);
  const milestonesByBranch = groupByBranchId(milestones);
  const expectedMarks = marks.length;
  const expectedPursuits = expectedCreatedPursuits(pursuits);
  const expectedMilestones = milestones.length;
  const allBranchIds = new Set([
    ...marksByBranch.keys(),
    ...pursuitsByBranch.keys(),
    ...milestonesByBranch.keys(),
  ]);

  const branches = await prisma.themeCategory.findMany({
    where: { id: { in: [...allBranchIds] }, userId },
    select: { id: true, themeId: true, isActive: true },
  });
  const branchById = new Map(branches.map((b) => [b.id, b]));
  for (const branchId of allBranchIds) {
    if (!branchById.has(branchId)) {
      return { ok: false, error: `Hub branch not found for "${branchId}"`, status: 404 };
    }
  }

  for (const branch of branchById.values()) {
    if (!branch.isActive) {
      await activateCategoryForUser(prisma, userId, branch.id);
    }
  }

  const clientKeyToGoalId = new Map<string, string>();
  const goalsNeedingRecompute = new Set<string>();
  const goalsNeedingShortLabel = new Set<string>();
  const touchedPursuitIds = new Set<string>();

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
        for (const id of counts.touchedPursuitIds) {
          touchedPursuitIds.add(id);
        }
      }

      if (createdMarks !== expectedMarks) {
        throw new Error(`Expected to create ${expectedMarks} mark(s), created ${createdMarks}.`);
      }
      if (createdPursuits !== expectedPursuits) {
        throw new Error(`Expected to create ${expectedPursuits} pursuit(s), created ${createdPursuits}.`);
      }
      if (createdMilestones !== expectedMilestones) {
        throw new Error(`Expected to create ${expectedMilestones} milestone(s), created ${createdMilestones}.`);
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
      for (const id of opCounts.touchedPursuitIds) {
        touchedPursuitIds.add(id);
      }
    });

    for (const goalId of goalsNeedingRecompute) {
      try {
        await recomputeGoalStatus(goalId);
      } catch (e) {
        console.error("[commitStreamGlobal] recomputeGoalStatus failed", goalId, e);
      }
    }

    await persistVisualsForGoals(goalsNeedingShortLabel);

    await recordStreamGlobalSession(prisma, userId, {
      inputText: payload.inputText,
      inputMode: payload.inputMode,
      itemsAdded: payload.itemsAdded,
      itemsSkipped: payload.itemsSkipped,
    });

    queueMemoryUpdateAfterStream(userId, payload.inputText);

    refreshInsightsAfterStreamCommit(userId, touchedPursuitIds);

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
