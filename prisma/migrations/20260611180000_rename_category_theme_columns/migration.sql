-- Physical column renames: branchId → categoryId, limbId → themeId (expand-contract complete).

-- Goal.categoryId (nullable FK)
ALTER TABLE "Goal" RENAME COLUMN "branchId" TO "categoryId";

-- Mark.categoryId (required FK)
ALTER TABLE "Mark" RENAME COLUMN "branchId" TO "categoryId";

-- StreamRun.categoryId
ALTER TABLE "StreamRun" RENAME COLUMN "branchId" TO "categoryId";

-- Life area id on taxonomy + map entities
ALTER TABLE "Branch" RENAME COLUMN "limbId" TO "themeId";
ALTER TABLE "Mark" RENAME COLUMN "limbId" TO "themeId";
ALTER TABLE "Goal" RENAME COLUMN "limbId" TO "themeId";
ALTER TABLE "StreamSession" RENAME COLUMN "limbId" TO "themeId";
ALTER TABLE "StreamRun" RENAME COLUMN "limbId" TO "themeId";

-- Index renames (columns already renamed; index definitions follow columns in PG)
ALTER INDEX IF EXISTS "Branch_userId_limbId_idx" RENAME TO "Branch_userId_themeId_idx";
ALTER INDEX IF EXISTS "Mark_branchId_idx" RENAME TO "Mark_categoryId_idx";
ALTER INDEX IF EXISTS "Mark_limbId_idx" RENAME TO "Mark_themeId_idx";
ALTER INDEX IF EXISTS "Mark_branchId_sequencePosition_idx" RENAME TO "Mark_categoryId_sequencePosition_idx";
ALTER INDEX IF EXISTS "StreamSession_userId_limbId_createdAt_idx" RENAME TO "StreamSession_userId_themeId_createdAt_idx";
ALTER INDEX IF EXISTS "Goal_branchId_idx" RENAME TO "Goal_categoryId_idx";
ALTER INDEX IF EXISTS "Goal_limbId_idx" RENAME TO "Goal_themeId_idx";
ALTER INDEX IF EXISTS "Goal_branchId_sequencePosition_idx" RENAME TO "Goal_categoryId_sequencePosition_idx";

-- FK constraint renames
ALTER TABLE "Mark" RENAME CONSTRAINT "Mark_branchId_fkey" TO "Mark_categoryId_fkey";
ALTER TABLE "Goal" RENAME CONSTRAINT "Goal_branchId_fkey" TO "Goal_categoryId_fkey";
