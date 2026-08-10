import {
  ChapterRevisionKind,
  ImportProposalKind,
  ImportProposalStatus,
  ImportSourceState,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeObservationStatus,
  LifeTemporalState,
  Prisma,
  PursuitStatus,
  SourceSupportType,
} from "@prisma/client";
import { deriveCategoryFiling } from "@/lib/category-derivation";
import { loadCategorySequencedNodes, resolveSequenceAnchor } from "@/lib/category-sequence";
import { getLifeArea } from "@/lib/life-areas";
import {
  ImportProposalApplicationConflictError,
  ImportProposalApplicationNotFoundError,
} from "@/lib/imports/apply-possibility-proposal";
import { parseNewChapterDraft, type NewChapterDraft } from "@/lib/imports/new-chapter-draft";
import { refreshImportSourceState } from "@/lib/imports/source-state";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { LIFE_AREA_IDS, normalizeCategoryLabelKey } from "@/lib/taxonomy";
import { parseUnlockedThemeIds } from "@/lib/unlocked-themes";
import {
  applyLivingTreeGroupMembership,
  undoLivingTreeGroupMembership,
} from "@/lib/living-tree/apply-group-membership";

type TransactionClient = Prisma.TransactionClient;
const TRANSACTION_ATTEMPTS = 3;

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function runSerializable<T>(work: (transaction: TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!retryable || attempt === TRANSACTION_ATTEMPTS) throw error;
    }
  }
  throw new Error("New chapter proposal transaction retry loop exited unexpectedly");
}

export type NewChapterProposalPlanInput = {
  status: ImportProposalStatus;
  kind: ImportProposalKind;
  memoryDestination: LifeMemoryDestination;
  evidenceCount: number;
  draft: NewChapterDraft | null;
  hasTargetChapter: boolean;
  hasRevertedApplication: boolean;
};

export function planNewChapterProposalApplication(input: NewChapterProposalPlanInput) {
  if (input.status === ImportProposalStatus.DISMISSED) {
    throw new ImportProposalApplicationConflictError("DISMISSED_PROPOSAL");
  }
  if (input.status === ImportProposalStatus.SUPERSEDED) {
    throw new ImportProposalApplicationConflictError("SUPERSEDED_PROPOSAL");
  }
  if (input.status === ImportProposalStatus.ACCEPTED) {
    throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
  }
  if (
    input.kind !== ImportProposalKind.NEW_CHAPTER ||
    input.memoryDestination !== LifeMemoryDestination.CHAPTER
  ) {
    throw new ImportProposalApplicationConflictError("UNSUPPORTED_PROPOSAL");
  }
  if (input.evidenceCount < 1) {
    throw new ImportProposalApplicationConflictError("MISSING_EVIDENCE");
  }
  if (!input.draft) {
    throw new ImportProposalApplicationConflictError("MISSING_CHAPTER_DRAFT");
  }
  if (input.hasRevertedApplication) {
    if (!input.hasTargetChapter) {
      throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
    }
    return { action: "restore_chapter" as const, draft: input.draft };
  }
  if (input.hasTargetChapter) {
    throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
  }
  return { action: "create_chapter" as const, draft: input.draft };
}

type StoredChapterState = {
  title: string;
  background: string | null;
  themeId: string | null;
  categoryId: string | null;
  goalType: string;
  status: PursuitStatus;
  timelineStart: string | null;
  future: boolean;
  year: number;
  month: number | null;
  sequencePosition: number | null;
};

function storedChapterState(value: Prisma.JsonValue): StoredChapterState | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (
    typeof state.title !== "string" ||
    !(typeof state.background === "string" || state.background === null) ||
    !(typeof state.themeId === "string" || state.themeId === null) ||
    !(typeof state.categoryId === "string" || state.categoryId === null) ||
    typeof state.goalType !== "string" ||
    !Object.values(PursuitStatus).includes(state.status as PursuitStatus) ||
    !(typeof state.timelineStart === "string" || state.timelineStart === null) ||
    typeof state.future !== "boolean" ||
    typeof state.year !== "number" ||
    !(typeof state.month === "number" || state.month === null) ||
    !(typeof state.sequencePosition === "number" || state.sequencePosition === null)
  ) {
    return null;
  }
  return state as StoredChapterState;
}

type ChapterForUndo = {
  title: string;
  background: string | null;
  themeId: string | null;
  categoryId: string | null;
  goalType: string;
  status: PursuitStatus;
  timelineStart: Date | null;
  future: boolean;
  year: number;
  month: number | null;
  sequencePosition: number | null;
  archived: boolean;
  _count: {
    milestones: number;
    contextEntries: number;
    relationshipsAsA: number;
    relationshipsAsB: number;
    statusTransitions: number;
  };
};

function chapterMatchesState(
  chapter: ChapterForUndo,
  state: StoredChapterState,
  archived: boolean,
): boolean {
  return (
    chapter.archived === archived &&
    chapter.title === state.title &&
    (chapter.background ?? null) === state.background &&
    (chapter.themeId ?? null) === state.themeId &&
    (chapter.categoryId ?? null) === state.categoryId &&
    chapter.goalType === state.goalType &&
    chapter.status === state.status &&
    chapter.timelineStart?.toISOString() === (state.timelineStart ?? undefined) &&
    chapter.future === state.future &&
    chapter.year === state.year &&
    chapter.month === state.month &&
    chapter.sequencePosition === state.sequencePosition &&
    chapter._count.milestones === 0 &&
    chapter._count.contextEntries === 0 &&
    chapter._count.relationshipsAsA === 0 &&
    chapter._count.relationshipsAsB === 0 &&
    chapter._count.statusTransitions === 0
  );
}

const NEW_CHAPTER_PROPOSAL_INCLUDE = {
  source: { select: { capturedAt: true, createdAt: true } },
  exactEvidence: { select: { role: true, evidenceSpanId: true } },
  application: {
    include: { resultObservation: { select: { id: true, userId: true, status: true } } },
  },
  targetGoal: {
    select: {
      id: true,
      userId: true,
      title: true,
      background: true,
      themeId: true,
      categoryId: true,
      goalType: true,
      status: true,
      timelineStart: true,
      future: true,
      year: true,
      month: true,
      sequencePosition: true,
      archived: true,
      _count: {
        select: {
          milestones: true,
          contextEntries: true,
          relationshipsAsA: true,
          relationshipsAsB: true,
          statusTransitions: true,
        },
      },
    },
  },
  chapterRevision: { select: { id: true, goalId: true, afterState: true } },
} satisfies Prisma.ImportProposalInclude;

async function activateThemeAndCategory(
  transaction: TransactionClient,
  userId: string,
  themeId: NewChapterDraft["primaryThemeId"],
  categoryId: string,
) {
  await transaction.themeCategory.update({ where: { id: categoryId }, data: { isActive: true } });
  const user = await transaction.user.findUniqueOrThrow({
    where: { id: userId },
    select: { unlockedLimbIds: true },
  });
  const unlocked = new Set(parseUnlockedThemeIds(user.unlockedLimbIds));
  unlocked.add(themeId);
  await transaction.user.update({
    where: { id: userId },
    data: { unlockedLimbIds: LIFE_AREA_IDS.filter((id) => unlocked.has(id)) },
  });
}

export type ApplyNewChapterProposalResult = {
  status: "applied" | "already_applied";
  proposalId: string;
  observationId: string;
  chapterId: string;
  sourceState: ImportSourceState;
};

export async function applyNewChapterProposalInTransaction(
  transaction: TransactionClient,
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyNewChapterProposalResult> {
  const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: NEW_CHAPTER_PROPOSAL_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();

    if (proposal.application && proposal.application.revertedAt === null) {
      if (
        proposal.status !== ImportProposalStatus.ACCEPTED ||
        !proposal.application.resultObservationId ||
        !proposal.targetGoalId
      ) {
        throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
      }
      return {
        status: "already_applied" as const,
        proposalId: proposal.id,
        observationId: proposal.application.resultObservationId,
        chapterId: proposal.targetGoalId,
        sourceState: (
          await transaction.importSource.findUniqueOrThrow({
            where: { id: sourceId },
            select: { state: true },
          })
        ).state,
      };
    }

    const plan = planNewChapterProposalApplication({
      status: proposal.status,
      kind: proposal.kind,
      memoryDestination: proposal.memoryDestination,
      evidenceCount: proposal.exactEvidence.length,
      draft: parseNewChapterDraft(proposal.payload),
      hasTargetChapter: Boolean(proposal.targetGoal),
      hasRevertedApplication: Boolean(proposal.application?.revertedAt),
    });

    if (plan.action === "restore_chapter") {
      const application = proposal.application;
      const observation = application?.resultObservation;
      const chapter = proposal.targetGoal;
      const revision = proposal.chapterRevision;
      const afterState = revision ? storedChapterState(revision.afterState) : null;
      if (
        !application ||
        !observation ||
        observation.userId !== userId ||
        observation.status !== LifeObservationStatus.DISMISSED ||
        !chapter ||
        chapter.userId !== userId ||
        !chapter.categoryId ||
        !revision ||
        revision.goalId !== chapter.id ||
        !afterState ||
        !chapterMatchesState(chapter, afterState, true)
      ) {
        throw new ImportProposalApplicationConflictError("STALE_TARGET");
      }
      await activateThemeAndCategory(
        transaction,
        userId,
        plan.draft.primaryThemeId,
        chapter.categoryId,
      );
      await transaction.goal.update({ where: { id: chapter.id }, data: { archived: false } });
      await transaction.lifeObservation.update({
        where: { id: observation.id },
        data: {
          status: LifeObservationStatus.ACTIVE,
          lastConfirmedAt: now,
          confirmedAt: now,
        },
      });
      await transaction.importProposalApplication.update({
        where: { id: application.id },
        data: { appliedAt: now, revertedAt: null },
      });
      await transaction.importProposal.update({
        where: { id: proposal.id },
        data: {
          status: ImportProposalStatus.ACCEPTED,
          reviewedAt: now,
          observationId: observation.id,
        },
      });
      await applyLivingTreeGroupMembership(transaction, {
        userId,
        goalId: chapter.id,
        applicationId: application.id,
        groupName: plan.draft.groupName,
        now,
      });
      return {
        status: "applied" as const,
        proposalId: proposal.id,
        observationId: observation.id,
        chapterId: chapter.id,
        sourceState: await refreshImportSourceState(transaction, sourceId),
      };
    }

    const filing = deriveCategoryFiling({
      themeId: plan.draft.primaryThemeId,
      title: plan.draft.title,
    });
    const categories = await transaction.themeCategory.findMany({
      where: { userId, themeId: plan.draft.primaryThemeId },
      select: { id: true, label: true },
    });
    const category = categories.find(
      (row) => normalizeCategoryLabelKey(row.label ?? "") === filing.hubSlug,
    );
    if (!category) {
      throw new ImportProposalApplicationConflictError("MISSING_TARGET");
    }

    const nodes = await loadCategorySequencedNodes(transaction, category.id);
    const sequencePosition = resolveSequenceAnchor(nodes, { kind: "append" }).sequencePosition;
    const observedAt = proposal.observedAt ?? proposal.source.capturedAt ?? proposal.source.createdAt;
    const observation = await transaction.lifeObservation.create({
      data: {
        userId,
        kind: proposal.informationType,
        status: LifeObservationStatus.ACTIVE,
        subjectType: proposal.subjectType,
        subjectLabel: proposal.subjectLabel,
        memoryDestination: LifeMemoryDestination.CHAPTER,
        temporalState: proposal.temporalState,
        temporalPrecision: proposal.temporalPrecision,
        canonicalKey: proposal.canonicalKey,
        canonicalText: proposal.proposedText,
        occurredAt:
          proposal.informationType === LifeObservationKind.EVENT ||
          proposal.informationType === LifeObservationKind.DECISION
            ? proposal.effectiveFrom
            : null,
        effectiveFrom: proposal.effectiveFrom,
        effectiveTo: proposal.effectiveTo,
        firstObservedAt: observedAt,
        lastMentionedAt: observedAt,
        lastConfirmedAt: now,
        confirmedAt: now,
        exactEvidence: {
          create: proposal.exactEvidence.map((evidence) => ({
            evidenceSpanId: evidence.evidenceSpanId,
            role: evidence.role,
            supportType: SourceSupportType.USER_CONFIRMED,
          })),
        },
      },
    });

    const timelineStart = proposal.effectiveFrom;
    const calendarAnchor = timelineStart ?? now;
    const chapter = await transaction.goal.create({
      data: {
        userId,
        title: plan.draft.title,
        description: "",
        background: proposal.proposedText,
        lifeArea: getLifeArea(plan.draft.primaryThemeId)?.label ?? "Other",
        goalType: "action",
        aiGenerated: false,
        archived: false,
        status: PursuitStatus.ACTIVE,
        future: proposal.temporalState === LifeTemporalState.PLANNED,
        year: calendarAnchor.getUTCFullYear(),
        month: calendarAnchor.getUTCMonth() + 1,
        timelineStart,
        sequencePosition,
        themeId: plan.draft.primaryThemeId,
        categoryId: category.id,
      },
    });
    await activateThemeAndCategory(
      transaction,
      userId,
      plan.draft.primaryThemeId,
      category.id,
    );
    await transaction.chapterObservation.create({
      data: { userId, goalId: chapter.id, observationId: observation.id, role: "PRIMARY" },
    });

    const afterState: StoredChapterState = {
      title: chapter.title,
      background: chapter.background,
      themeId: chapter.themeId,
      categoryId: chapter.categoryId,
      goalType: chapter.goalType,
      status: chapter.status,
      timelineStart: chapter.timelineStart?.toISOString() ?? null,
      future: chapter.future,
      year: chapter.year,
      month: chapter.month,
      sequencePosition: chapter.sequencePosition,
    };
    await transaction.chapterRevision.create({
      data: {
        userId,
        goalId: chapter.id,
        proposalId: proposal.id,
        kind: ChapterRevisionKind.CREATED,
        summary: proposal.proposedText,
        beforeState: { exists: false },
        afterState,
        occurredAt: proposal.effectiveFrom,
        confirmedAt: now,
        exactEvidence: {
          create: proposal.exactEvidence.map((evidence) => ({
            evidenceSpanId: evidence.evidenceSpanId,
          })),
        },
      },
    });
    await transaction.importProposal.update({
      where: { id: proposal.id },
      data: {
        status: ImportProposalStatus.ACCEPTED,
        reviewedAt: now,
        observationId: observation.id,
        targetGoalId: chapter.id,
      },
    });
    const application = await transaction.importProposalApplication.create({
      data: {
        userId,
        proposalId: proposal.id,
        resultObservationId: observation.id,
        appliedAt: now,
      },
    });
    await applyLivingTreeGroupMembership(transaction, {
      userId,
      goalId: chapter.id,
      applicationId: application.id,
      groupName: plan.draft.groupName,
      now,
    });

  return {
      status: "applied" as const,
      proposalId: proposal.id,
      observationId: observation.id,
      chapterId: chapter.id,
      sourceState: await refreshImportSourceState(transaction, sourceId),
    };
}

export async function applyNewChapterProposal(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<ApplyNewChapterProposalResult> {
  await ensureTaxonomyCurrent(prisma, userId);
  const result = await runSerializable((transaction) =>
    applyNewChapterProposalInTransaction(transaction, userId, sourceId, proposalId, now),
  );

  if (result.status === "applied") {
    try {
      await markPursuitReadingDirty(userId, result.chapterId, "import_proposal_applied", {
        details: { event: "created" },
      });
    } catch (error) {
      console.error("[imports] Created chapter but could not mark insights dirty", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return result;
}

export type UndoNewChapterProposalResult = {
  status: "undone" | "already_undone";
  proposalId: string;
  chapterId: string | null;
  sourceState: ImportSourceState;
};

export async function undoNewChapterProposalApplication(
  userId: string,
  sourceId: string,
  proposalId: string,
  now: Date = new Date(),
): Promise<UndoNewChapterProposalResult> {
  const result = await runSerializable(async (transaction) => {
    const proposal = await transaction.importProposal.findFirst({
      where: { id: proposalId, sourceId, userId },
      include: NEW_CHAPTER_PROPOSAL_INCLUDE,
    });
    if (!proposal) throw new ImportProposalApplicationNotFoundError();
    const application = proposal.application;
    if (!application || application.revertedAt) {
      return {
        status: "already_undone" as const,
        proposalId: proposal.id,
        chapterId: proposal.targetGoalId,
        sourceState: (
          await transaction.importSource.findUniqueOrThrow({
            where: { id: sourceId },
            select: { state: true },
          })
        ).state,
      };
    }

    const observation = application.resultObservation;
    const chapter = proposal.targetGoal;
    const revision = proposal.chapterRevision;
    const afterState = revision ? storedChapterState(revision.afterState) : null;
    if (
      proposal.kind !== ImportProposalKind.NEW_CHAPTER ||
      proposal.status !== ImportProposalStatus.ACCEPTED ||
      proposal.memoryDestination !== LifeMemoryDestination.CHAPTER ||
      !observation ||
      observation.userId !== userId ||
      observation.status !== LifeObservationStatus.ACTIVE ||
      !chapter ||
      chapter.userId !== userId ||
      !revision ||
      revision.goalId !== chapter.id ||
      !afterState
    ) {
      throw new ImportProposalApplicationConflictError("INCONSISTENT_APPLICATION");
    }
    if (!chapterMatchesState(chapter, afterState, false)) {
      throw new ImportProposalApplicationConflictError("STALE_TARGET");
    }

    await undoLivingTreeGroupMembership(transaction, {
      userId,
      goalId: chapter.id,
      applicationId: application.id,
      now,
    });
    await transaction.goal.update({ where: { id: chapter.id }, data: { archived: true } });
    await transaction.lifeObservation.update({
      where: { id: observation.id },
      data: { status: LifeObservationStatus.DISMISSED },
    });
    await transaction.importProposalApplication.update({
      where: { id: application.id },
      data: { revertedAt: now },
    });
    await transaction.importProposal.update({
      where: { id: proposal.id },
      data: { status: ImportProposalStatus.PENDING, reviewedAt: null, observationId: null },
    });
    return {
      status: "undone" as const,
      proposalId: proposal.id,
      chapterId: chapter.id,
      sourceState: await refreshImportSourceState(transaction, sourceId),
    };
  });

  if (result.chapterId && result.status === "undone") {
    try {
      await markPursuitReadingDirty(userId, result.chapterId, "import_proposal_undone", {
        details: { event: "archived" },
      });
    } catch (error) {
      console.error("[imports] Undid new chapter but could not mark insights dirty", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return result;
}
