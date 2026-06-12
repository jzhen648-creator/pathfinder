-- Rename bloom vocabulary to pursuit status at the DB layer.

ALTER TYPE "BloomStatus" RENAME TO "PursuitStatus";

ALTER TABLE "Goal" RENAME COLUMN "bloomedAt" TO "completedAt";
ALTER TABLE "ThemeCategory" RENAME COLUMN "bloomedAt" TO "completedAt";
ALTER TABLE "StreamRun" RENAME COLUMN "previousBloomStatus" TO "previousStatus";
