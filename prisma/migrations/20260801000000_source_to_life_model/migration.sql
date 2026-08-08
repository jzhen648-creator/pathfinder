-- CreateEnum
CREATE TYPE "ImportContentType" AS ENUM ('TEXT', 'URL', 'PHOTO', 'VOICE', 'MIXED');

-- CreateEnum
CREATE TYPE "ImportSourceState" AS ENUM ('RECEIVED', 'STORED', 'PROCESSING', 'PROCESSED', 'AWAITING_REVIEW', 'PARTIALLY_APPLIED', 'APPLIED', 'DISMISSED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportJobStage" AS ENUM ('NORMALIZE', 'DEDUPLICATE', 'SEGMENT', 'EXTRACT', 'RECONCILE', 'PROPOSE');

-- CreateEnum
CREATE TYPE "ImportSegmentStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LifeObservationKind" AS ENUM ('FACT', 'DECISION', 'COMMITMENT', 'TENSION', 'OPEN_QUESTION', 'PREFERENCE', 'CONTEXT');

-- CreateEnum
CREATE TYPE "LifeObservationStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ObservationEvidenceRole" AS ENUM ('SUPPORTS', 'CONTRADICTS');

-- CreateEnum
CREATE TYPE "ChapterObservationRole" AS ENUM ('PRIMARY', 'RELATED');

-- CreateEnum
CREATE TYPE "ImportProposalKind" AS ENUM ('NEW_OBSERVATION', 'REINFORCEMENT', 'UPDATE', 'CONFLICT', 'POSSIBLE_CONNECTION', 'NEW_CHAPTER');

-- CreateEnum
CREATE TYPE "ImportProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'DEFERRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChapterRevisionKind" AS ENUM ('CREATED', 'UPDATED', 'DECISION', 'COMMITMENT', 'TENSION', 'TIMING', 'STATUS', 'CONNECTION');

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientImportId" TEXT NOT NULL,
    "contentType" "ImportContentType" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "title" TEXT,
    "sourceUrl" TEXT,
    "sourceApp" TEXT,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3),
    "state" "ImportSourceState" NOT NULL DEFAULT 'RECEIVED',
    "duplicateOfId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFragment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LifeObservationKind" NOT NULL,
    "status" "LifeObservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "canonicalText" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationEvidence" (
    "observationId" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "role" "ObservationEvidenceRole" NOT NULL DEFAULT 'SUPPORTS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationEvidence_pkey" PRIMARY KEY ("observationId", "fragmentId")
);

-- CreateTable
CREATE TABLE "ChapterObservation" (
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "role" "ChapterObservationRole" NOT NULL DEFAULT 'PRIMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterObservation_pkey" PRIMARY KEY ("goalId", "observationId")
);

-- CreateTable
CREATE TABLE "ImportProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fragmentId" TEXT,
    "observationId" TEXT,
    "targetGoalId" TEXT,
    "relatedGoalId" TEXT,
    "kind" "ImportProposalKind" NOT NULL,
    "status" "ImportProposalStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION,
    "canonicalKey" TEXT,
    "processingKey" TEXT NOT NULL,
    "proposedText" TEXT NOT NULL,
    "rationale" TEXT,
    "payload" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "proposalId" TEXT,
    "kind" "ChapterRevisionKind" NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterRevisionEvidence" (
    "revisionId" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterRevisionEvidence_pkey" PRIMARY KEY ("revisionId", "fragmentId")
);

-- CreateTable
CREATE TABLE "InterpretationCorrection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT,
    "fragmentId" TEXT,
    "originalInterpretation" JSONB NOT NULL,
    "correctedInterpretation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterpretationCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "ImportJobStage" NOT NULL DEFAULT 'NORMALIZE',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "processingVersion" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSegmentRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ImportSegmentStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "errorCode" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSegmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_userId_clientImportId_key" ON "ImportSource"("userId", "clientImportId");
CREATE INDEX "ImportSource_userId_contentHash_idx" ON "ImportSource"("userId", "contentHash");
CREATE INDEX "ImportSource_userId_state_createdAt_idx" ON "ImportSource"("userId", "state", "createdAt");
CREATE INDEX "ImportSource_duplicateOfId_idx" ON "ImportSource"("duplicateOfId");
CREATE UNIQUE INDEX "SourceFragment_sourceId_position_key" ON "SourceFragment"("sourceId", "position");
CREATE INDEX "SourceFragment_sourceId_contentHash_idx" ON "SourceFragment"("sourceId", "contentHash");
CREATE INDEX "LifeObservation_userId_status_updatedAt_idx" ON "LifeObservation"("userId", "status", "updatedAt");
CREATE INDEX "LifeObservation_userId_kind_idx" ON "LifeObservation"("userId", "kind");
CREATE INDEX "ObservationEvidence_fragmentId_idx" ON "ObservationEvidence"("fragmentId");
CREATE INDEX "ChapterObservation_userId_createdAt_idx" ON "ChapterObservation"("userId", "createdAt");
CREATE INDEX "ChapterObservation_observationId_idx" ON "ChapterObservation"("observationId");
CREATE INDEX "ImportProposal_userId_status_createdAt_idx" ON "ImportProposal"("userId", "status", "createdAt");
CREATE INDEX "ImportProposal_sourceId_status_idx" ON "ImportProposal"("sourceId", "status");
CREATE UNIQUE INDEX "ImportProposal_sourceId_processingKey_key" ON "ImportProposal"("sourceId", "processingKey");
CREATE INDEX "ImportProposal_fragmentId_idx" ON "ImportProposal"("fragmentId");
CREATE INDEX "ImportProposal_observationId_idx" ON "ImportProposal"("observationId");
CREATE INDEX "ImportProposal_targetGoalId_idx" ON "ImportProposal"("targetGoalId");
CREATE INDEX "ImportProposal_relatedGoalId_idx" ON "ImportProposal"("relatedGoalId");
CREATE UNIQUE INDEX "ChapterRevision_proposalId_key" ON "ChapterRevision"("proposalId");
CREATE INDEX "ChapterRevision_goalId_confirmedAt_idx" ON "ChapterRevision"("goalId", "confirmedAt");
CREATE INDEX "ChapterRevision_userId_confirmedAt_idx" ON "ChapterRevision"("userId", "confirmedAt");
CREATE INDEX "ChapterRevisionEvidence_fragmentId_idx" ON "ChapterRevisionEvidence"("fragmentId");
CREATE INDEX "InterpretationCorrection_userId_createdAt_idx" ON "InterpretationCorrection"("userId", "createdAt");
CREATE INDEX "InterpretationCorrection_proposalId_idx" ON "InterpretationCorrection"("proposalId");
CREATE INDEX "InterpretationCorrection_fragmentId_idx" ON "InterpretationCorrection"("fragmentId");
CREATE UNIQUE INDEX "ImportJob_sourceId_runKey_key" ON "ImportJob"("sourceId", "runKey");
CREATE INDEX "ImportJob_status_nextRetryAt_idx" ON "ImportJob"("status", "nextRetryAt");
CREATE UNIQUE INDEX "ImportSegmentRun_jobId_fragmentId_key" ON "ImportSegmentRun"("jobId", "fragmentId");
CREATE INDEX "ImportSegmentRun_jobId_status_position_idx" ON "ImportSegmentRun"("jobId", "status", "position");
CREATE INDEX "ImportSegmentRun_status_nextRetryAt_idx" ON "ImportSegmentRun"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceFragment" ADD CONSTRAINT "SourceFragment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifeObservation" ADD CONSTRAINT "LifeObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationEvidence" ADD CONSTRAINT "ObservationEvidence_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "LifeObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationEvidence" ADD CONSTRAINT "ObservationEvidence_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "SourceFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterObservation" ADD CONSTRAINT "ChapterObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterObservation" ADD CONSTRAINT "ChapterObservation_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterObservation" ADD CONSTRAINT "ChapterObservation_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "LifeObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "SourceFragment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "LifeObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_targetGoalId_fkey" FOREIGN KEY ("targetGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposal" ADD CONSTRAINT "ImportProposal_relatedGoalId_fkey" FOREIGN KEY ("relatedGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ImportProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChapterRevisionEvidence" ADD CONSTRAINT "ChapterRevisionEvidence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChapterRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterRevisionEvidence" ADD CONSTRAINT "ChapterRevisionEvidence_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "SourceFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterpretationCorrection" ADD CONSTRAINT "InterpretationCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterpretationCorrection" ADD CONSTRAINT "InterpretationCorrection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ImportProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterpretationCorrection" ADD CONSTRAINT "InterpretationCorrection_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "SourceFragment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportSegmentRun" ADD CONSTRAINT "ImportSegmentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportSegmentRun" ADD CONSTRAINT "ImportSegmentRun_fragmentId_fkey" FOREIGN KEY ("fragmentId") REFERENCES "SourceFragment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth for Supabase's exposed public schema. The application uses
-- owner-scoped Next.js API routes and does not expose these tables via Data API.
ALTER TABLE "ImportSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceFragment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifeObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObservationEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterRevisionEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterpretationCorrection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportSegmentRun" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
    "ImportSource",
    "SourceFragment",
    "LifeObservation",
    "ObservationEvidence",
    "ChapterObservation",
    "ImportProposal",
    "ChapterRevision",
    "ChapterRevisionEvidence",
    "InterpretationCorrection",
    "ImportJob",
    "ImportSegmentRun"
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportSource", "SourceFragment", "LifeObservation", "ObservationEvidence", "ChapterObservation", "ImportProposal", "ChapterRevision", "ChapterRevisionEvidence", "InterpretationCorrection", "ImportJob", "ImportSegmentRun" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportSource", "SourceFragment", "LifeObservation", "ObservationEvidence", "ChapterObservation", "ImportProposal", "ChapterRevision", "ChapterRevisionEvidence", "InterpretationCorrection", "ImportJob", "ImportSegmentRun" FROM authenticated';
    END IF;
END
$$;
