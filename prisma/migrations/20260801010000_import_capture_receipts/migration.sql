-- Preserve each capture event separately from canonical source content.
CREATE TYPE "ImportCaptureDisposition" AS ENUM (
    'PRIMARY',
    'DUPLICATE_IGNORED',
    'DUPLICATE_RETAINED'
);

CREATE TABLE "ImportCaptureReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "clientImportId" TEXT NOT NULL,
    "disposition" "ImportCaptureDisposition" NOT NULL DEFAULT 'PRIMARY',
    "title" TEXT,
    "sourceUrl" TEXT,
    "sourceApp" TEXT,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportCaptureReceipt_pkey" PRIMARY KEY ("id")
);

-- Backfill one receipt per source created by the unshipped foundation. The
-- source columns remain temporarily as a compatibility/rollback snapshot.
INSERT INTO "ImportCaptureReceipt" (
    "id",
    "userId",
    "sourceId",
    "clientImportId",
    "disposition",
    "title",
    "sourceUrl",
    "sourceApp",
    "metadata",
    "capturedAt",
    "deletedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_' || "id",
    "userId",
    "id",
    "clientImportId",
    CASE
        WHEN "duplicateOfId" IS NULL THEN 'PRIMARY'::"ImportCaptureDisposition"
        ELSE 'DUPLICATE_RETAINED'::"ImportCaptureDisposition"
    END,
    "title",
    "sourceUrl",
    "sourceApp",
    "metadata",
    "capturedAt",
    "deletedAt",
    "createdAt",
    "updatedAt"
FROM "ImportSource";

CREATE UNIQUE INDEX "ImportCaptureReceipt_userId_clientImportId_key"
ON "ImportCaptureReceipt"("userId", "clientImportId");

CREATE UNIQUE INDEX "ImportSource_id_userId_key"
ON "ImportSource"("id", "userId");

CREATE INDEX "ImportCaptureReceipt_sourceId_deletedAt_createdAt_idx"
ON "ImportCaptureReceipt"("sourceId", "deletedAt", "createdAt");

CREATE INDEX "ImportCaptureReceipt_userId_deletedAt_createdAt_idx"
ON "ImportCaptureReceipt"("userId", "deletedAt", "createdAt");

-- New writes maintain one active canonical artifact while legacy explicitly
-- retained duplicates remain exempt for rollback compatibility.
CREATE UNIQUE INDEX "ImportSource_active_canonical_content_key"
ON "ImportSource"("userId", "contentHash")
WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NULL;

ALTER TABLE "ImportCaptureReceipt"
ADD CONSTRAINT "ImportCaptureReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportCaptureReceipt"
ADD CONSTRAINT "ImportCaptureReceipt_sourceId_userId_fkey"
FOREIGN KEY ("sourceId", "userId") REFERENCES "ImportSource"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app server is the only access path. Keep the public-schema table out of
-- Supabase Data API roles even if project defaults still auto-grant access.
ALTER TABLE "ImportCaptureReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ImportCaptureReceipt" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportCaptureReceipt" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "ImportCaptureReceipt" FROM authenticated';
    END IF;
END
$$;
