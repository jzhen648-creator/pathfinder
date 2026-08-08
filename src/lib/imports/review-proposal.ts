import {
  ImportProposalStatus,
  ImportProposalKind,
  LifeBackgroundCategory,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeTemporalPrecision,
  LifeTemporalState,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { refreshImportSourceState } from "@/lib/imports/source-state";
import {
  parseNewChapterDraft,
  withNewChapterDraft,
  withoutNewChapterDraft,
} from "@/lib/imports/new-chapter-draft";
import {
  withProposalReviewDecision,
  withoutProposalReviewDecision,
} from "@/lib/imports/proposal-review-decision";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

const optionalDate = z.string().datetime({ offset: true }).nullable().optional();

export const reviewImportProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select") }).strict(),
  z.object({ action: z.literal("defer") }).strict(),
  z.object({ action: z.literal("dismiss") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z
    .object({
      action: z.literal("set_new_chapter"),
      title: z.string().trim().min(1).max(100),
      primaryThemeId: z.enum(LIFE_AREA_IDS),
    })
    .strict(),
  z
    .object({
      action: z.literal("edit"),
      proposedText: z.string().trim().min(1).max(2_000),
      temporalState: z.nativeEnum(LifeTemporalState).optional(),
      temporalPrecision: z.nativeEnum(LifeTemporalPrecision).optional(),
      effectiveFrom: optionalDate,
      effectiveTo: optionalDate,
      newChapterDraft: z
        .object({
          title: z.string().trim().min(1).max(100),
          primaryThemeId: z.enum(LIFE_AREA_IDS),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      memoryDestination: z.nativeEnum(LifeMemoryDestination),
      targetGoalId: z.string().trim().min(1).nullable().optional(),
      backgroundCategory: z.nativeEnum(LifeBackgroundCategory).nullable().optional(),
    })
    .strict(),
]);

export type ReviewImportProposalInput = z.infer<typeof reviewImportProposalSchema>;

export class ImportProposalReviewNotFoundError extends Error {
  constructor() {
    super("Import proposal not found");
    this.name = "ImportProposalReviewNotFoundError";
  }
}

export type ImportProposalReviewConflictCode =
  | "ALREADY_APPLIED"
  | "SUPERSEDED_PROPOSAL"
  | "CHAPTER_TARGET_REQUIRED"
  | "INVALID_CHAPTER_TARGET";

export class ImportProposalReviewConflictError extends Error {
  readonly code: ImportProposalReviewConflictCode;

  constructor(code: ImportProposalReviewConflictCode) {
    super(code);
    this.name = "ImportProposalReviewConflictError";
    this.code = code;
  }
}

function isoOrNull(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function interpretationSnapshot(proposal: {
  proposedText: string;
  memoryDestination: LifeMemoryDestination;
  targetGoalId: string | null;
  backgroundCategory: LifeBackgroundCategory | null;
  temporalState: LifeTemporalState;
  temporalPrecision: LifeTemporalPrecision;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  payload: Prisma.JsonValue | null;
}) {
  return {
    proposedText: proposal.proposedText,
    memoryDestination: proposal.memoryDestination,
    targetGoalId: proposal.targetGoalId,
    backgroundCategory: proposal.backgroundCategory,
    temporalState: proposal.temporalState,
    temporalPrecision: proposal.temporalPrecision,
    effectiveFrom: isoOrNull(proposal.effectiveFrom),
    effectiveTo: isoOrNull(proposal.effectiveTo),
    newChapterDraft: parseNewChapterDraft(proposal.payload),
  };
}

function parseDatePatch(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

export async function reviewImportProposal(
  userId: string,
  sourceId: string,
  proposalId: string,
  input: ReviewImportProposalInput,
  now: Date = new Date(),
) {
  return prisma.$transaction(
    async (transaction) => {
      const proposal = await transaction.importProposal.findFirst({
        where: { id: proposalId, sourceId, userId },
      });
      if (!proposal) throw new ImportProposalReviewNotFoundError();
      if (proposal.status === ImportProposalStatus.ACCEPTED) {
        throw new ImportProposalReviewConflictError("ALREADY_APPLIED");
      }
      if (proposal.status === ImportProposalStatus.SUPERSEDED) {
        throw new ImportProposalReviewConflictError("SUPERSEDED_PROPOSAL");
      }

      if (input.action === "defer") {
        await transaction.importProposal.update({
          where: { id: proposal.id },
          data: {
            status: ImportProposalStatus.DEFERRED,
            reviewedAt: now,
            payload: withoutProposalReviewDecision(proposal.payload),
          },
        });
      } else if (input.action === "dismiss") {
        await transaction.importProposal.update({
          where: { id: proposal.id },
          data: {
            status: ImportProposalStatus.DISMISSED,
            reviewedAt: now,
            payload: withoutProposalReviewDecision(proposal.payload),
          },
        });
      } else if (input.action === "restore") {
        await transaction.importProposal.update({
          where: { id: proposal.id },
          data: {
            status: ImportProposalStatus.PENDING,
            reviewedAt: null,
            payload: withoutProposalReviewDecision(proposal.payload),
          },
        });
      } else if (input.action === "select") {
        await transaction.importProposal.update({
          where: { id: proposal.id },
          data: {
            status: ImportProposalStatus.PENDING,
            reviewedAt: now,
            payload: withProposalReviewDecision(proposal.payload, "accept"),
          },
        });
      } else {
        const original = interpretationSnapshot(proposal);
        const clearedPayload = withoutProposalReviewDecision(proposal.payload);
        const updateData: Prisma.ImportProposalUpdateInput =
          input.action === "edit"
            ? {
                proposedText: input.proposedText,
                temporalState: input.temporalState,
                temporalPrecision: input.temporalPrecision,
                effectiveFrom: parseDatePatch(input.effectiveFrom),
                effectiveTo: parseDatePatch(input.effectiveTo),
                ...(input.newChapterDraft
                  ? {
                      payload: withNewChapterDraft(clearedPayload, input.newChapterDraft),
                    }
                  : { payload: clearedPayload }),
              }
            : input.action === "set_new_chapter"
              ? {
                  kind: ImportProposalKind.NEW_CHAPTER,
                  memoryDestination: LifeMemoryDestination.CHAPTER,
                  backgroundCategory: null,
                  observation: { disconnect: true },
                  targetGoal: { disconnect: true },
                  payload: withNewChapterDraft(clearedPayload, {
                    title: input.title,
                    primaryThemeId: input.primaryThemeId,
                  }),
                }
              : {
                memoryDestination: input.memoryDestination,
                backgroundCategory:
                  input.memoryDestination === LifeMemoryDestination.BACKGROUND
                    ? input.backgroundCategory
                    : null,
                ...(input.memoryDestination === LifeMemoryDestination.POSSIBILITY
                  ? {
                      kind: ImportProposalKind.NEW_OBSERVATION,
                      informationType: LifeObservationKind.POSSIBILITY,
                      observation: { disconnect: true },
                    }
                  : {}),
                ...(input.memoryDestination === LifeMemoryDestination.SOURCE_ONLY
                  ? { status: ImportProposalStatus.DISMISSED, reviewedAt: now }
                  : {}),
                ...(proposal.kind === ImportProposalKind.NEW_CHAPTER
                  ? {
                      kind:
                        input.memoryDestination === LifeMemoryDestination.CHAPTER
                          ? ImportProposalKind.UPDATE
                          : ImportProposalKind.NEW_OBSERVATION,
                      payload: withoutNewChapterDraft(clearedPayload),
                    }
                  : { payload: clearedPayload }),
              };

        if (input.action === "move") {
          if (
            input.memoryDestination === LifeMemoryDestination.CHAPTER &&
            !input.targetGoalId
          ) {
            throw new ImportProposalReviewConflictError("CHAPTER_TARGET_REQUIRED");
          }
          if (input.targetGoalId) {
            const target = await transaction.goal.findFirst({
              where: { id: input.targetGoalId, userId, archived: false },
              select: { id: true },
            });
            if (!target) {
              throw new ImportProposalReviewConflictError("INVALID_CHAPTER_TARGET");
            }
          }
          updateData.targetGoal = input.targetGoalId
            ? { connect: { id: input.targetGoalId } }
            : { disconnect: true };
        }

        const updated = await transaction.importProposal.update({
          where: { id: proposal.id },
          data: updateData,
        });
        await transaction.interpretationCorrection.create({
          data: {
            userId,
            proposalId: proposal.id,
            fragmentId: proposal.fragmentId,
            originalInterpretation: original,
            correctedInterpretation: interpretationSnapshot(updated),
          },
        });
      }

      const updated = await transaction.importProposal.findUniqueOrThrow({
        where: { id: proposal.id },
        select: {
          id: true,
          status: true,
          proposedText: true,
          memoryDestination: true,
          targetGoalId: true,
          backgroundCategory: true,
          temporalState: true,
          temporalPrecision: true,
          effectiveFrom: true,
          effectiveTo: true,
          payload: true,
          reviewedAt: true,
        },
      });
      return {
        proposal: {
          ...updated,
          effectiveFrom: isoOrNull(updated.effectiveFrom),
          effectiveTo: isoOrNull(updated.effectiveTo),
          reviewedAt: isoOrNull(updated.reviewedAt),
        },
        sourceState: await refreshImportSourceState(transaction, sourceId),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
