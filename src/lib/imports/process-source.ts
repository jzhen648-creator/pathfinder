import { createHash } from "node:crypto";
import {
  Prisma,
  type ImportProposalKind,
  type LifeBackgroundCategory,
  type LifeMemoryDestination,
  type LifeObservationKind,
  type LifeSubjectType,
  type LifeTemporalPrecision,
  type LifeTemporalState,
  type ObservationEvidenceRole,
  type SourceSupportType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  aiImportExtractionProvider,
  type ImportExtractionProvider,
  type ImportProviderContext,
} from "./ai-import-provider";
import {
  ImportProviderOutputError,
  assertExtractionEvidenceMatchesSegment,
  normalizeExtractionEvidenceOffsets,
  parseImportExtractionResult,
  type ImportExtractionResult,
} from "./extraction-contract";
import { assertImportGraphOwnership, ImportOwnershipError } from "./ownership";
import {
  partitionProposalCandidates,
  type ConsolidatedCandidate,
  type ReconciliationCandidate,
} from "./reconciliation";
import { segmentImportSource } from "./segmentation";

export const IMPORT_PROCESSING_VERSION = "source-processing-v2-semantic-evidence";
export const IMPORT_PROCESSING_RUN_KEY = IMPORT_PROCESSING_VERSION;
export const DEFAULT_IMPORT_SEGMENTS_PER_RUN = 6;
const STALE_JOB_AFTER_MS = 5 * 60_000;
const TRANSIENT_RETRY_DELAY_MS = 30_000;
const RATE_LIMIT_RETRY_DELAY_MS = 120_000;
const TRANSIENT_IN_RUN_BACKOFF_MS = 1_500;
const PREPARE_TRANSACTION_ATTEMPTS = 3;

export class ImportSourceProcessingNotFoundError extends Error {
  readonly code = "IMPORT_SOURCE_NOT_FOUND";

  constructor() {
    super("Import source not found");
    this.name = "ImportSourceProcessingNotFoundError";
  }
}

export class ImportProcessingReferenceError extends Error {
  readonly code = "UNSAFE_PROVIDER_REFERENCE";

  constructor() {
    super("Provider output referenced an unknown or non-owned entity.");
    this.name = "ImportProcessingReferenceError";
  }
}

export type ImportProcessingResult =
  | { status: "completed"; jobId: string; proposalCount: number; overflowCount: number; retainedOnlyCount: number }
  | { status: "needs_retry"; jobId: string; failedSegments: number[]; retryAt: Date | null }
  | { status: "more_pending"; jobId: string; pendingSegments: number[] }
  | { status: "failed"; jobId: string; errorCode: string }
  | { status: "already_processing"; jobId: string }
  | { status: "already_processed"; jobId: string; proposalCount: number }
  | { status: "skipped_exact_duplicate"; jobId: string };

export type ImportProcessingOptions = {
  provider?: ImportExtractionProvider;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  forceRetry?: boolean;
  maxSegmentsPerRun?: number;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function providerStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    return typeof error.status === "number" ? error.status : null;
  }
  return null;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function classifyProviderFailure(error: unknown, now: Date) {
  if (error instanceof ImportProviderOutputError) {
    return { errorCode: error.code, nextRetryAt: null };
  }
  const status = providerStatus(error);
  if (status === 429) {
    return {
      errorCode: "PROVIDER_RATE_LIMITED",
      nextRetryAt: new Date(now.getTime() + RATE_LIMIT_RETRY_DELAY_MS),
    };
  }
  if (status === 503) {
    return {
      errorCode: "PROVIDER_TRANSIENT",
      nextRetryAt: new Date(now.getTime() + TRANSIENT_RETRY_DELAY_MS),
    };
  }
  return { errorCode: "PROVIDER_FAILED", nextRetryAt: null };
}

async function extractWithTransientRetry(
  provider: ImportExtractionProvider,
  input: Parameters<ImportExtractionProvider["extractSegment"]>[0],
  wait: (milliseconds: number) => Promise<void>,
): Promise<ImportExtractionResult> {
  let output: unknown;
  try {
    output = await provider.extractSegment(input);
  } catch (error) {
    if (providerStatus(error) !== 503) throw error;
    await wait(TRANSIENT_IN_RUN_BACKOFF_MS);
    output = await provider.extractSegment(input);
  }
  return assertExtractionEvidenceMatchesSegment(
    normalizeExtractionEvidenceOffsets(parseImportExtractionResult(output), input.segmentText),
    input.segmentText,
  );
}

function proposalKind(classification: ConsolidatedCandidate["classification"]): ImportProposalKind {
  switch (classification) {
    case "new":
      return "NEW_OBSERVATION";
    case "reinforcement":
      return "REINFORCEMENT";
    case "update":
      return "UPDATE";
    case "conflict":
      return "CONFLICT";
    case "possible_connection":
      return "POSSIBLE_CONNECTION";
    case "new_chapter":
      return "NEW_CHAPTER";
    case "no_durable_value":
    case "uncertain":
      throw new Error("Retained-only candidates cannot become proposals");
  }
}

const INFORMATION_TYPE: Record<ConsolidatedCandidate["informationType"], LifeObservationKind> = {
  fact: "FACT",
  event: "EVENT",
  aspiration: "ASPIRATION",
  decision: "DECISION",
  commitment: "COMMITMENT",
  possibility: "POSSIBILITY",
  tension: "TENSION",
  open_question: "OPEN_QUESTION",
  preference: "PREFERENCE",
  context: "CONTEXT",
  interpretation: "INTERPRETATION",
  advice: "ADVICE",
};

const SUBJECT_TYPE: Record<ConsolidatedCandidate["subjectType"], LifeSubjectType> = {
  user: "USER",
  other_person: "OTHER_PERSON",
  shared: "SHARED",
  unknown: "UNKNOWN",
};

const MEMORY_DESTINATION: Record<ConsolidatedCandidate["memoryDestination"], LifeMemoryDestination> = {
  chapter: "CHAPTER",
  background: "BACKGROUND",
  possibility: "POSSIBILITY",
  source_only: "SOURCE_ONLY",
};

const BACKGROUND_CATEGORY: Record<
  NonNullable<ConsolidatedCandidate["backgroundCategory"]>,
  LifeBackgroundCategory
> = {
  identity: "IDENTITY",
  people: "PEOPLE",
  places: "PLACES",
  work_qualifications: "WORK_QUALIFICATIONS",
  assets_finances: "ASSETS_FINANCES",
  health: "HEALTH",
  preferences_constraints: "PREFERENCES_CONSTRAINTS",
  other: "OTHER",
};

const TEMPORAL_STATE: Record<ConsolidatedCandidate["temporal"]["state"], LifeTemporalState> = {
  past: "PAST",
  current: "CURRENT",
  ongoing: "ONGOING",
  planned: "PLANNED",
  possible: "POSSIBLE",
  unresolved: "UNRESOLVED",
  unknown: "UNKNOWN",
};

const TEMPORAL_PRECISION: Record<
  ConsolidatedCandidate["temporal"]["precision"],
  LifeTemporalPrecision
> = {
  exact: "EXACT",
  approximate: "APPROXIMATE",
  range: "RANGE",
  ongoing: "ONGOING",
  unknown: "UNKNOWN",
};

const EVIDENCE_ROLE = {
  supports: "SUPPORTS",
  contradicts: "CONTRADICTS",
} satisfies Record<ConsolidatedCandidate["evidence"][number]["role"], ObservationEvidenceRole>;

const SUPPORT_TYPE = {
  explicit: "EXPLICIT",
  inferred: "INFERRED",
  user_confirmed: "USER_CONFIRMED",
} satisfies Record<ConsolidatedCandidate["evidence"][number]["supportType"], SourceSupportType>;

function optionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
}

function proposalProcessingKey(candidate: ConsolidatedCandidate): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: IMPORT_PROCESSING_VERSION,
        classification: candidate.classification,
        canonicalKey: candidate.canonicalKey ?? null,
        observation: candidate.existingObservationId ?? null,
        evidence: candidate.evidence
          .map((evidence) => [
            evidence.segmentId,
            evidence.startOffset,
            evidence.endOffset,
            evidence.role,
          ])
          .sort(),
        goals: [...candidate.targetGoalIds].sort(),
        chapterTitle: candidate.chapterTitle ?? null,
        primaryThemeId: candidate.primaryThemeId ?? null,
        groupName: candidate.groupName ?? null,
      }),
      "utf8",
    )
    .digest("hex");
}

async function loadProviderContext(userId: string): Promise<ImportProviderContext> {
  const [goals, observations] = await Promise.all([
    prisma.goal.findMany({
      where: { userId },
      select: { id: true, title: true, background: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.lifeObservation.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true, kind: true, canonicalText: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  return { goals, observations };
}

async function assertCandidateReferences(
  userId: string,
  candidates: readonly ReconciliationCandidate[],
): Promise<void> {
  const goalIds = [...new Set(candidates.flatMap((candidate) => candidate.targetGoalIds ?? []))];
  const observationIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate.existingObservationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [goals, observations] = await Promise.all([
    goalIds.length
      ? prisma.goal.findMany({ where: { id: { in: goalIds } }, select: { id: true, userId: true } })
      : [],
    observationIds.length
      ? prisma.lifeObservation.findMany({
          where: { id: { in: observationIds } },
          select: { id: true, userId: true },
        })
      : [],
  ]);

  if (goals.length !== goalIds.length || observations.length !== observationIds.length) {
    throw new ImportProcessingReferenceError();
  }
  assertImportGraphOwnership(userId, [
    ...goals.map((goal) => ({ entity: "chapter" as const, id: goal.id, userId: goal.userId })),
    ...observations.map((observation) => ({
      entity: "observation" as const,
      id: observation.id,
      userId: observation.userId,
    })),
  ]);
}

async function prepareProcessingOnce(userId: string, sourceId: string, now: Date) {
  return prisma.$transaction(async (transaction) => {
    const source = await transaction.importSource.findFirst({
      where: { id: sourceId, userId, deletedAt: null, state: { not: "DELETED" } },
    });
    if (!source) throw new ImportSourceProcessingNotFoundError();

    const existingJob = await transaction.importJob.findUnique({
      where: { sourceId_runKey: { sourceId, runKey: IMPORT_PROCESSING_RUN_KEY } },
    });
    if (existingJob?.status === "SUCCEEDED") {
      return { disposition: "already_processed" as const, source, job: existingJob };
    }
    if (
      existingJob?.status === "RUNNING" &&
      existingJob.startedAt &&
      existingJob.startedAt.getTime() > now.getTime() - STALE_JOB_AFTER_MS
    ) {
      return { disposition: "already_processing" as const, source, job: existingJob };
    }

    const job = await transaction.importJob.upsert({
      where: { sourceId_runKey: { sourceId, runKey: IMPORT_PROCESSING_RUN_KEY } },
      create: {
        sourceId,
        runKey: IMPORT_PROCESSING_RUN_KEY,
        processingVersion: IMPORT_PROCESSING_VERSION,
        status: source.duplicateOfId ? "CANCELLED" : "RUNNING",
        stage: "SEGMENT",
        attempt: source.duplicateOfId ? 0 : 1,
        startedAt: source.duplicateOfId ? null : now,
        finishedAt: source.duplicateOfId ? now : null,
        errorCode: source.duplicateOfId ? "EXACT_DUPLICATE_NOT_PROCESSED" : null,
      },
      update: source.duplicateOfId
        ? {
            status: "CANCELLED",
            finishedAt: now,
            errorCode: "EXACT_DUPLICATE_NOT_PROCESSED",
            errorDetail: null,
            nextRetryAt: null,
          }
        : {
            status: "RUNNING",
            stage: "SEGMENT",
            attempt: { increment: 1 },
            startedAt: now,
            finishedAt: null,
            errorCode: null,
            errorDetail: null,
            nextRetryAt: null,
          },
    });

    if (source.duplicateOfId) {
      return { disposition: "skipped_exact_duplicate" as const, source, job };
    }

    if (existingJob?.status === "RUNNING") {
      await transaction.importSegmentRun.updateMany({
        where: { jobId: job.id, status: "RUNNING" },
        data: { status: "FAILED", errorCode: "WORKER_INTERRUPTED", nextRetryAt: now },
      });
    }

    await transaction.importSource.update({
      where: { id: sourceId },
      data: { state: "PROCESSING" },
    });

    const segments = segmentImportSource(source.rawText);
    for (const segment of segments) {
      const fragment = await transaction.sourceFragment.upsert({
        where: { sourceId_position: { sourceId, position: segment.position } },
        create: { sourceId, ...segment },
        update: {
          startOffset: segment.startOffset,
          endOffset: segment.endOffset,
          contentHash: segment.contentHash,
          text: segment.text,
        },
      });
      await transaction.importSegmentRun.upsert({
        where: { jobId_fragmentId: { jobId: job.id, fragmentId: fragment.id } },
        create: { jobId: job.id, fragmentId: fragment.id, position: segment.position },
        update: { position: segment.position },
      });
    }

    return { disposition: "ready" as const, source, job };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function prepareProcessing(userId: string, sourceId: string, now: Date) {
  for (let attempt = 1; attempt <= PREPARE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prepareProcessingOnce(userId, sourceId, now);
    } catch (error) {
      const canRetry = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!canRetry || attempt === PREPARE_TRANSACTION_ATTEMPTS) throw error;
    }
  }
  throw new Error("Import processing transaction retry loop exited unexpectedly");
}

async function finalizeProposals(userId: string, sourceId: string, jobId: string, now: Date) {
  const segmentRuns = await prisma.importSegmentRun.findMany({
    where: { jobId },
    include: { fragment: { select: { id: true, startOffset: true } } },
    orderBy: { position: "asc" },
  });
  const failed = segmentRuns.filter((segment) => segment.status === "FAILED");
  if (failed.length > 0) {
    const retryDates = failed
      .map((segment) => segment.nextRetryAt)
      .filter((date): date is Date => Boolean(date));
    const retryAt = retryDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const failedSegments = failed.map((segment) => segment.position);
    await prisma.$transaction([
      prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          stage: "EXTRACT",
          errorCode: "PARTIAL_SEGMENT_FAILURE",
          errorDetail: JSON.stringify({ failedSegments }),
          nextRetryAt: retryAt,
          finishedAt: now,
        },
      }),
      prisma.importSource.update({ where: { id: sourceId }, data: { state: "FAILED" } }),
    ]);
    return { status: "needs_retry" as const, jobId, failedSegments, retryAt };
  }

  const pending = segmentRuns.filter((segment) => segment.status !== "SUCCEEDED");
  if (pending.length > 0) {
    const pendingSegments = pending.map((segment) => segment.position);
    await prisma.$transaction([
      prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: "PENDING",
          stage: "EXTRACT",
          errorCode: null,
          errorDetail: null,
          nextRetryAt: null,
          finishedAt: null,
        },
      }),
      prisma.importSource.update({ where: { id: sourceId }, data: { state: "PROCESSING" } }),
    ]);
    return { status: "more_pending" as const, jobId, pendingSegments };
  }

  const candidates: ReconciliationCandidate[] = segmentRuns.flatMap((segment) => {
    const result = parseImportExtractionResult(segment.result);
    return result.candidates.map((candidate) => ({
      ...candidate,
      id: `${segment.id}:${candidate.id}`,
      evidence: candidate.evidence.map((evidence) => ({
        ...evidence,
        segmentId: segment.fragment.id,
        startOffset: segment.fragment.startOffset + evidence.startOffset,
        endOffset: segment.fragment.startOffset + evidence.endOffset,
      })),
    }));
  });
  await assertCandidateReferences(userId, candidates);
  const partition = partitionProposalCandidates(candidates);
  const reviewable = [
    ...partition.primary.map((candidate) => ({ candidate, reviewBucket: "primary" as const })),
    ...partition.overflow.map((candidate) => ({ candidate, reviewBucket: "overflow" as const })),
  ];
  const source = await prisma.importSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: { rawText: true, capturedAt: true, createdAt: true },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.importJob.update({ where: { id: jobId }, data: { stage: "RECONCILE" } });
    await transaction.importProposal.deleteMany({
      where: { sourceId, status: "PENDING" },
    });
    for (const { candidate, reviewBucket } of reviewable) {
      const exactEvidence = [];
      for (const evidence of candidate.evidence) {
        if (source.rawText.slice(evidence.startOffset, evidence.endOffset) !== evidence.quote) {
          throw new ImportProviderOutputError();
        }
        const span = await transaction.sourceEvidenceSpan.upsert({
          where: {
            sourceId_startOffset_endOffset: {
              sourceId,
              startOffset: evidence.startOffset,
              endOffset: evidence.endOffset,
            },
          },
          create: {
            sourceId,
            segmentId: evidence.segmentId,
            startOffset: evidence.startOffset,
            endOffset: evidence.endOffset,
            contentHash: createHash("sha256").update(evidence.quote, "utf8").digest("hex"),
            text: evidence.quote,
          },
          update: {
            segmentId: evidence.segmentId,
            contentHash: createHash("sha256").update(evidence.quote, "utf8").digest("hex"),
            text: evidence.quote,
          },
          select: { id: true },
        });
        exactEvidence.push({
          evidenceSpanId: span.id,
          role: EVIDENCE_ROLE[evidence.role],
          supportType: SUPPORT_TYPE[evidence.supportType],
        });
      }

      await transaction.importProposal.create({
        data: {
          userId,
          sourceId,
          fragmentId: candidate.evidence[0]?.segmentId ?? null,
          observationId: candidate.existingObservationId ?? null,
          targetGoalId: candidate.targetGoalIds[0] ?? null,
          relatedGoalId: candidate.targetGoalIds[1] ?? null,
          kind: proposalKind(candidate.classification),
          informationType: INFORMATION_TYPE[candidate.informationType],
          subjectType: SUBJECT_TYPE[candidate.subjectType],
          subjectLabel: candidate.subjectLabel ?? null,
          memoryDestination: MEMORY_DESTINATION[candidate.memoryDestination],
          backgroundCategory: candidate.backgroundCategory
            ? BACKGROUND_CATEGORY[candidate.backgroundCategory]
            : null,
          temporalState: TEMPORAL_STATE[candidate.temporal.state],
          temporalPrecision: TEMPORAL_PRECISION[candidate.temporal.precision],
          observedAt: source.capturedAt ?? source.createdAt,
          effectiveFrom: optionalDate(candidate.temporal.effectiveFrom),
          effectiveTo: optionalDate(candidate.temporal.effectiveTo),
          confidence: candidate.confidence,
          canonicalKey: candidate.canonicalKey ?? null,
          processingKey: proposalProcessingKey(candidate),
          proposedText: candidate.proposedText,
          rationale: candidate.rationale ?? null,
          payload: {
            processingVersion: IMPORT_PROCESSING_VERSION,
            reviewBucket,
            candidateIds: candidate.candidateIds,
            targetGoalIds: candidate.targetGoalIds,
            ...(candidate.classification === "new_chapter" &&
            candidate.chapterTitle &&
            candidate.primaryThemeId
              ? {
                  newChapterDraft: {
                    title: candidate.chapterTitle,
                    primaryThemeId: candidate.primaryThemeId,
                    groupName: candidate.groupName ?? candidate.chapterTitle,
                  },
                }
              : {}),
          },
          exactEvidence: { create: exactEvidence },
        },
      });
    }
    await transaction.importSource.update({
      where: { id: sourceId },
      data: { state: reviewable.length > 0 ? "AWAITING_REVIEW" : "PROCESSED" },
    });
    await transaction.importJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        stage: "PROPOSE",
        errorCode: null,
        errorDetail: null,
        nextRetryAt: null,
        finishedAt: now,
      },
    });
  });

  return {
    status: "completed" as const,
    jobId,
    proposalCount: reviewable.length,
    overflowCount: partition.overflow.length,
    retainedOnlyCount: partition.retainedOnly.length,
  };
}

/**
 * Processes stored sources into reversible proposals. Successful segment output
 * survives partial failure; this function never mutates goals or observations.
 */
export async function processImportSource(
  userId: string,
  sourceId: string,
  options: ImportProcessingOptions = {},
): Promise<ImportProcessingResult> {
  const provider = options.provider ?? aiImportExtractionProvider;
  const now = options.now ?? (() => new Date());
  const wait = options.sleep ?? sleep;
  const maxSegmentsPerRun = Math.max(
    1,
    Math.floor(options.maxSegmentsPerRun ?? DEFAULT_IMPORT_SEGMENTS_PER_RUN),
  );
  const prepared = await prepareProcessing(userId, sourceId, now());

  if (prepared.disposition === "already_processing") {
    return { status: "already_processing", jobId: prepared.job.id };
  }
  if (prepared.disposition === "already_processed") {
    const proposalCount = await prisma.importProposal.count({ where: { sourceId } });
    return { status: "already_processed", jobId: prepared.job.id, proposalCount };
  }
  if (prepared.disposition === "skipped_exact_duplicate") {
    return { status: "skipped_exact_duplicate", jobId: prepared.job.id };
  }

  const context = await loadProviderContext(userId);
  await prisma.importJob.update({ where: { id: prepared.job.id }, data: { stage: "EXTRACT" } });
  const segmentRuns = await prisma.importSegmentRun.findMany({
    where: { jobId: prepared.job.id },
    include: { fragment: true },
    orderBy: { position: "asc" },
  });

  let processedThisRun = 0;
  for (const segment of segmentRuns) {
    if (processedThisRun >= maxSegmentsPerRun) break;
    if (segment.status === "SUCCEEDED") continue;
    const attemptAt = now();
    if (
      !options.forceRetry &&
      segment.nextRetryAt &&
      segment.nextRetryAt.getTime() > attemptAt.getTime()
    ) {
      continue;
    }

    const claim = await prisma.importSegmentRun.updateMany({
      where: { id: segment.id, status: { in: ["PENDING", "FAILED"] } },
      data: {
        status: "RUNNING",
        attempt: { increment: 1 },
        errorCode: null,
        nextRetryAt: null,
        startedAt: attemptAt,
        finishedAt: null,
      },
    });
    if (claim.count === 0) continue;
    processedThisRun += 1;

    try {
      const result = await extractWithTransientRetry(
        provider,
        {
          userId,
          sourceId,
          segmentPosition: segment.position,
          segmentText: segment.fragment.text,
          context,
        },
        wait,
      );
      await prisma.importSegmentRun.update({
        where: { id: segment.id },
        data: {
          status: "SUCCEEDED",
          result: result as Prisma.InputJsonValue,
          errorCode: null,
          nextRetryAt: null,
          finishedAt: now(),
        },
      });
    } catch (error) {
      const failure = classifyProviderFailure(error, now());
      await prisma.importSegmentRun.update({
        where: { id: segment.id },
        data: {
          status: "FAILED",
          result: Prisma.DbNull,
          errorCode: failure.errorCode,
          nextRetryAt: failure.nextRetryAt,
          finishedAt: now(),
        },
      });
    }
  }

  try {
    return await finalizeProposals(userId, sourceId, prepared.job.id, now());
  } catch (error) {
    const errorCode =
      error instanceof ImportProcessingReferenceError || error instanceof ImportOwnershipError
        ? "UNSAFE_PROVIDER_REFERENCE"
        : error instanceof ImportProviderOutputError
          ? error.code
          : "RECONCILIATION_FAILED";
    await prisma.$transaction([
      prisma.importJob.update({
        where: { id: prepared.job.id },
        data: {
          status: "FAILED",
          stage: "RECONCILE",
          errorCode,
          errorDetail: null,
          nextRetryAt: null,
          finishedAt: now(),
        },
      }),
      prisma.importSource.update({ where: { id: sourceId }, data: { state: "FAILED" } }),
    ]);
    return { status: "failed", jobId: prepared.job.id, errorCode };
  }
}
