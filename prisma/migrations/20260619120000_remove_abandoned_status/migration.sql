-- Remove ABANDONED from PursuitStatus (archive is the soft-delete path).
-- Convert any remaining rows before the enum swap (orphaned abandon flow).

UPDATE "Goal" SET "archived" = true, "status" = 'ACTIVE' WHERE "status" = 'ABANDONED';
UPDATE "ThemeCategory" SET "lifecycleStatus" = 'ACTIVE' WHERE "lifecycleStatus" = 'ABANDONED';
UPDATE "StreamRun" SET "previousStatus" = NULL WHERE "previousStatus" = 'ABANDONED';

BEGIN;
CREATE TYPE "PursuitStatus_new" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETE', 'MAINTAINING');
ALTER TABLE "Goal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ThemeCategory" ALTER COLUMN "lifecycleStatus" DROP DEFAULT;
ALTER TABLE "ThemeCategory" ALTER COLUMN "lifecycleStatus" TYPE "PursuitStatus_new" USING ("lifecycleStatus"::text::"PursuitStatus_new");
ALTER TABLE "StreamRun" ALTER COLUMN "previousStatus" TYPE "PursuitStatus_new" USING ("previousStatus"::text::"PursuitStatus_new");
ALTER TABLE "Goal" ALTER COLUMN "status" TYPE "PursuitStatus_new" USING ("status"::text::"PursuitStatus_new");
ALTER TYPE "PursuitStatus" RENAME TO "PursuitStatus_old";
ALTER TYPE "PursuitStatus_new" RENAME TO "PursuitStatus";
DROP TYPE "public"."PursuitStatus_old";
ALTER TABLE "Goal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "ThemeCategory" ALTER COLUMN "lifecycleStatus" SET DEFAULT 'ACTIVE';
COMMIT;
