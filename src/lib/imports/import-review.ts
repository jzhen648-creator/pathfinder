import { Prisma } from "@prisma/client";
import {
  IMPORT_SOURCE_DETAIL_SELECT,
  serializeImportSourceDetail,
} from "@/lib/imports/ingest-source";
import { parseNewChapterDraft } from "@/lib/imports/new-chapter-draft";
import { parseProposalReviewDecision } from "@/lib/imports/proposal-review-decision";

export const IMPORT_REVIEW_SOURCE_SELECT = {
  ...IMPORT_SOURCE_DETAIL_SELECT,
  jobs: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      stage: true,
      attempt: true,
      errorCode: true,
      nextRetryAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  proposals: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      kind: true,
      status: true,
      informationType: true,
      subjectType: true,
      subjectLabel: true,
      memoryDestination: true,
      backgroundCategory: true,
      temporalState: true,
      temporalPrecision: true,
      observedAt: true,
      effectiveFrom: true,
      effectiveTo: true,
      confidence: true,
      canonicalKey: true,
      proposedText: true,
      rationale: true,
      payload: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      targetGoal: { select: { id: true, title: true, themeId: true } },
      relatedGoal: { select: { id: true, title: true, themeId: true } },
      exactEvidence: {
        orderBy: { createdAt: "asc" as const },
        select: {
          role: true,
          supportType: true,
          evidenceSpan: {
            select: {
              id: true,
              startOffset: true,
              endOffset: true,
              text: true,
            },
          },
        },
      },
      application: {
        select: {
          id: true,
          resultObservationId: true,
          appliedAt: true,
          revertedAt: true,
        },
      },
      chapterRevision: {
        select: { id: true, goalId: true, kind: true, summary: true, confirmedAt: true },
      },
    },
  },
} satisfies Prisma.ImportSourceSelect;

type ImportReviewSource = Prisma.ImportSourceGetPayload<{
  select: typeof IMPORT_REVIEW_SOURCE_SELECT;
}>;

function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function reviewBucket(payload: Prisma.JsonValue | null): "primary" | "overflow" {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return "primary";
  return (payload as Record<string, unknown>).reviewBucket === "overflow"
    ? "overflow"
    : "primary";
}

export function serializeImportReviewSource(source: ImportReviewSource) {
  const base = serializeImportSourceDetail(source);
  return {
    ...base,
    processing: source.jobs[0]
      ? {
          ...source.jobs[0],
          nextRetryAt: iso(source.jobs[0].nextRetryAt),
          startedAt: iso(source.jobs[0].startedAt),
          finishedAt: iso(source.jobs[0].finishedAt),
          createdAt: source.jobs[0].createdAt.toISOString(),
          updatedAt: source.jobs[0].updatedAt.toISOString(),
        }
      : null,
    proposals: source.proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      informationType: proposal.informationType,
      subjectType: proposal.subjectType,
      subjectLabel: proposal.subjectLabel,
      memoryDestination: proposal.memoryDestination,
      backgroundCategory: proposal.backgroundCategory,
      temporalState: proposal.temporalState,
      temporalPrecision: proposal.temporalPrecision,
      observedAt: iso(proposal.observedAt),
      effectiveFrom: iso(proposal.effectiveFrom),
      effectiveTo: iso(proposal.effectiveTo),
      confidence: proposal.confidence,
      canonicalKey: proposal.canonicalKey,
      proposedText: proposal.proposedText,
      rationale: proposal.rationale,
      reviewBucket: reviewBucket(proposal.payload),
      newChapterDraft: parseNewChapterDraft(proposal.payload),
      reviewDecision: parseProposalReviewDecision(proposal.payload),
      reviewedAt: iso(proposal.reviewedAt),
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
      targetChapter: proposal.targetGoal,
      relatedChapter: proposal.relatedGoal,
      evidence: proposal.exactEvidence.map((evidence) => ({
        id: evidence.evidenceSpan.id,
        role: evidence.role,
        supportType: evidence.supportType,
        startOffset: evidence.evidenceSpan.startOffset,
        endOffset: evidence.evidenceSpan.endOffset,
        text: evidence.evidenceSpan.text,
      })),
      application: proposal.application
        ? {
            ...proposal.application,
            appliedAt: proposal.application.appliedAt.toISOString(),
            revertedAt: iso(proposal.application.revertedAt),
          }
        : null,
      chapterRevision: proposal.chapterRevision
        ? {
            ...proposal.chapterRevision,
            confirmedAt: proposal.chapterRevision.confirmedAt.toISOString(),
          }
        : null,
    })),
  };
}
