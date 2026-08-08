-- Additive V2 semantic and provenance foundation. Existing coarse fragment
-- relations remain intact until the review/apply loop is proven.

ALTER TYPE "LifeObservationKind" ADD VALUE IF NOT EXISTS 'EVENT';
ALTER TYPE "LifeObservationKind" ADD VALUE IF NOT EXISTS 'ASPIRATION';
ALTER TYPE "LifeObservationKind" ADD VALUE IF NOT EXISTS 'POSSIBILITY';
ALTER TYPE "LifeObservationKind" ADD VALUE IF NOT EXISTS 'INTERPRETATION';
ALTER TYPE "LifeObservationKind" ADD VALUE IF NOT EXISTS 'ADVICE';

CREATE TYPE "LifeSubjectType" AS ENUM ('USER', 'OTHER_PERSON', 'SHARED', 'UNKNOWN');
CREATE TYPE "LifeMemoryDestination" AS ENUM ('CHAPTER', 'BACKGROUND', 'POSSIBILITY', 'SOURCE_ONLY');
CREATE TYPE "LifeBackgroundCategory" AS ENUM ('IDENTITY', 'PEOPLE', 'PLACES', 'WORK_QUALIFICATIONS', 'ASSETS_FINANCES', 'HEALTH', 'PREFERENCES_CONSTRAINTS', 'OTHER');
CREATE TYPE "LifeTemporalState" AS ENUM ('PAST', 'CURRENT', 'ONGOING', 'PLANNED', 'POSSIBLE', 'UNRESOLVED', 'UNKNOWN');
CREATE TYPE "LifeTemporalPrecision" AS ENUM ('EXACT', 'APPROXIMATE', 'RANGE', 'ONGOING', 'UNKNOWN');
CREATE TYPE "SourceSupportType" AS ENUM ('EXPLICIT', 'INFERRED', 'USER_CONFIRMED');

ALTER TABLE "LifeObservation"
    ADD COLUMN "subjectType" "LifeSubjectType" NOT NULL DEFAULT 'USER',
    ADD COLUMN "subjectLabel" TEXT,
    ADD COLUMN "memoryDestination" "LifeMemoryDestination" NOT NULL DEFAULT 'BACKGROUND',
    ADD COLUMN "backgroundCategory" "LifeBackgroundCategory",
    ADD COLUMN "temporalState" "LifeTemporalState" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "temporalPrecision" "LifeTemporalPrecision" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "effectiveFrom" TIMESTAMP(3),
    ADD COLUMN "effectiveTo" TIMESTAMP(3),
    ADD COLUMN "firstObservedAt" TIMESTAMP(3),
    ADD COLUMN "lastMentionedAt" TIMESTAMP(3),
    ADD COLUMN "lastConfirmedAt" TIMESTAMP(3);

ALTER TABLE "ImportProposal"
    ADD COLUMN "informationType" "LifeObservationKind" NOT NULL DEFAULT 'CONTEXT',
    ADD COLUMN "subjectType" "LifeSubjectType" NOT NULL DEFAULT 'USER',
    ADD COLUMN "subjectLabel" TEXT,
    ADD COLUMN "memoryDestination" "LifeMemoryDestination" NOT NULL DEFAULT 'BACKGROUND',
    ADD COLUMN "backgroundCategory" "LifeBackgroundCategory",
    ADD COLUMN "temporalState" "LifeTemporalState" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "temporalPrecision" "LifeTemporalPrecision" NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN "observedAt" TIMESTAMP(3),
    ADD COLUMN "effectiveFrom" TIMESTAMP(3),
    ADD COLUMN "effectiveTo" TIMESTAMP(3);

CREATE TABLE "SourceEvidenceSpan" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "segmentId" TEXT,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceEvidenceSpan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SourceEvidenceSpan_valid_offsets" CHECK ("startOffset" >= 0 AND "endOffset" > "startOffset")
);

CREATE TABLE "ImportProposalEvidence" (
    "proposalId" TEXT NOT NULL,
    "evidenceSpanId" TEXT NOT NULL,
    "role" "ObservationEvidenceRole" NOT NULL DEFAULT 'SUPPORTS',
    "supportType" "SourceSupportType" NOT NULL DEFAULT 'EXPLICIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportProposalEvidence_pkey" PRIMARY KEY ("proposalId", "evidenceSpanId", "role")
);

CREATE TABLE "ObservationEvidenceSpan" (
    "observationId" TEXT NOT NULL,
    "evidenceSpanId" TEXT NOT NULL,
    "role" "ObservationEvidenceRole" NOT NULL DEFAULT 'SUPPORTS',
    "supportType" "SourceSupportType" NOT NULL DEFAULT 'EXPLICIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObservationEvidenceSpan_pkey" PRIMARY KEY ("observationId", "evidenceSpanId", "role")
);

CREATE TABLE "ChapterRevisionEvidenceSpan" (
    "revisionId" TEXT NOT NULL,
    "evidenceSpanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterRevisionEvidenceSpan_pkey" PRIMARY KEY ("revisionId", "evidenceSpanId")
);

CREATE UNIQUE INDEX "SourceEvidenceSpan_sourceId_startOffset_endOffset_key" ON "SourceEvidenceSpan"("sourceId", "startOffset", "endOffset");
CREATE INDEX "SourceEvidenceSpan_segmentId_idx" ON "SourceEvidenceSpan"("segmentId");
CREATE INDEX "SourceEvidenceSpan_sourceId_contentHash_idx" ON "SourceEvidenceSpan"("sourceId", "contentHash");
CREATE INDEX "ImportProposalEvidence_evidenceSpanId_idx" ON "ImportProposalEvidence"("evidenceSpanId");
CREATE INDEX "ObservationEvidenceSpan_evidenceSpanId_idx" ON "ObservationEvidenceSpan"("evidenceSpanId");
CREATE INDEX "ChapterRevisionEvidenceSpan_evidenceSpanId_idx" ON "ChapterRevisionEvidenceSpan"("evidenceSpanId");
CREATE INDEX "ImportProposal_userId_status_memoryDestination_idx" ON "ImportProposal"("userId", "status", "memoryDestination");
CREATE INDEX "LifeObservation_userId_memoryDestination_status_idx" ON "LifeObservation"("userId", "memoryDestination", "status");

ALTER TABLE "SourceEvidenceSpan" ADD CONSTRAINT "SourceEvidenceSpan_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceEvidenceSpan" ADD CONSTRAINT "SourceEvidenceSpan_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "SourceFragment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposalEvidence" ADD CONSTRAINT "ImportProposalEvidence_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ImportProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposalEvidence" ADD CONSTRAINT "ImportProposalEvidence_evidenceSpanId_fkey" FOREIGN KEY ("evidenceSpanId") REFERENCES "SourceEvidenceSpan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationEvidenceSpan" ADD CONSTRAINT "ObservationEvidenceSpan_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "LifeObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationEvidenceSpan" ADD CONSTRAINT "ObservationEvidenceSpan_evidenceSpanId_fkey" FOREIGN KEY ("evidenceSpanId") REFERENCES "SourceEvidenceSpan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterRevisionEvidenceSpan" ADD CONSTRAINT "ChapterRevisionEvidenceSpan_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChapterRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterRevisionEvidenceSpan" ADD CONSTRAINT "ChapterRevisionEvidenceSpan_evidenceSpanId_fkey" FOREIGN KEY ("evidenceSpanId") REFERENCES "SourceEvidenceSpan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app server is the only access path. Keep all new public-schema tables
-- unavailable to Supabase Data API roles, with RLS as defense in depth.
ALTER TABLE "SourceEvidenceSpan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportProposalEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObservationEvidenceSpan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChapterRevisionEvidenceSpan" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "SourceEvidenceSpan", "ImportProposalEvidence", "ObservationEvidenceSpan", "ChapterRevisionEvidenceSpan" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "SourceEvidenceSpan", "ImportProposalEvidence", "ObservationEvidenceSpan", "ChapterRevisionEvidenceSpan" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "SourceEvidenceSpan", "ImportProposalEvidence", "ObservationEvidenceSpan", "ChapterRevisionEvidenceSpan" FROM authenticated';
    END IF;
END
$$;
