-- Phase C tail: physical SQL names match Prisma ThemeCategory / status / taxonomyVersion.

-- User taxonomy sync columns
ALTER TABLE "User" RENAME COLUMN "hubTaxonomyVersion" TO "taxonomyVersion";
ALTER TABLE "User" RENAME COLUMN "hubTaxonomySyncedAt" TO "taxonomySyncedAt";

-- Taxonomy table + hub-prefixed columns
ALTER TABLE "Branch" RENAME TO "ThemeCategory";
ALTER TABLE "ThemeCategory" RENAME COLUMN "parentBranchId" TO "parentCategoryId";
ALTER TABLE "ThemeCategory" RENAME COLUMN "isSystemHub" TO "isSystemCategory";
ALTER TABLE "ThemeCategory" RENAME COLUMN "spawnedFromBranchId" TO "spawnedFromCategoryId";

-- Pursuit lifecycle column
ALTER TABLE "Goal" RENAME COLUMN "bloomStatus" TO "status";

-- Index renames (follow table/column renames)
ALTER INDEX IF EXISTS "Branch_userId_idx" RENAME TO "ThemeCategory_userId_idx";
ALTER INDEX IF EXISTS "Branch_userId_themeId_idx" RENAME TO "ThemeCategory_userId_themeId_idx";
ALTER INDEX IF EXISTS "Branch_userId_isActive_idx" RENAME TO "ThemeCategory_userId_isActive_idx";

-- FK constraint renames on ThemeCategory self-reference
ALTER TABLE "ThemeCategory" RENAME CONSTRAINT "Branch_spawnedFromBranchId_fkey" TO "ThemeCategory_spawnedFromCategoryId_fkey";
ALTER TABLE "ThemeCategory" RENAME CONSTRAINT "Branch_parentBranchId_fkey" TO "ThemeCategory_parentCategoryId_fkey";
ALTER TABLE "ThemeCategory" RENAME CONSTRAINT "Branch_userId_fkey" TO "ThemeCategory_userId_fkey";