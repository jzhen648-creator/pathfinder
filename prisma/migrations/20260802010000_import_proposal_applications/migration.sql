-- Preserve stable meaning across proposal application and undo.
ALTER TABLE "LifeObservation"
    ADD COLUMN "canonicalKey" TEXT,
    ADD COLUMN "supersedesObservationId" TEXT;

CREATE TABLE "ImportProposalApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "targetObservationId" TEXT,
    "resultObservationId" TEXT,
    "priorTargetStatus" "LifeObservationStatus",
    "priorTargetEffectiveTo" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "ImportProposalApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportProposalApplication_proposalId_key"
    ON "ImportProposalApplication"("proposalId");
CREATE UNIQUE INDEX "ImportProposalApplication_resultObservationId_key"
    ON "ImportProposalApplication"("resultObservationId");
CREATE INDEX "ImportProposalApplication_userId_appliedAt_idx"
    ON "ImportProposalApplication"("userId", "appliedAt");
CREATE INDEX "ImportProposalApplication_targetObservationId_idx"
    ON "ImportProposalApplication"("targetObservationId");
CREATE INDEX "LifeObservation_userId_canonicalKey_status_idx"
    ON "LifeObservation"("userId", "canonicalKey", "status");
CREATE INDEX "LifeObservation_supersedesObservationId_idx"
    ON "LifeObservation"("supersedesObservationId");

ALTER TABLE "LifeObservation"
    ADD CONSTRAINT "LifeObservation_supersedesObservationId_fkey"
    FOREIGN KEY ("supersedesObservationId") REFERENCES "LifeObservation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposalApplication"
    ADD CONSTRAINT "ImportProposalApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposalApplication"
    ADD CONSTRAINT "ImportProposalApplication_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "ImportProposal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportProposalApplication"
    ADD CONSTRAINT "ImportProposalApplication_targetObservationId_fkey"
    FOREIGN KEY ("targetObservationId") REFERENCES "LifeObservation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportProposalApplication"
    ADD CONSTRAINT "ImportProposalApplication_resultObservationId_fkey"
    FOREIGN KEY ("resultObservationId") REFERENCES "LifeObservation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportProposalApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ImportProposalApplication" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportProposalApplication" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportProposalApplication" FROM authenticated';
    END IF;
END
$$;
