-- Phase C tail: physical SQL names match Prisma ThemeCategory / status / taxonomyVersion.

-- User taxonomy sync columns
ALTER TABLE "User" RENAME COLUMN "hubTaxonomyVersion" TO "taxonomyVersion";
ALTER TABLE "User" RENAME COLUMN "hubTaxonomySyncedAt" TO "taxonomySyncedAt";

-- Taxonomy table + hub-prefixed columns
ALTER TABLE "Branch" RENAME TO "ThemeCategory";
ALTER TABLE "ThemeCategory" RENAME COLUMN "parentBranchId" TO "parentCategoryId";
ALTER TABLE "ThemeCategory" RENAME COLUMN "isSystemHub" TO "isSystemCategory";
ALTER TABLE "ThemeCategory" RENAME COLUMN "spawnedFromBranchId" TO "spawnedFromCategoryId";

-- Pursuit lifecycle column (Goal only — ThemeCategory keeps separate status + bloomStatus)
ALTER TABLE "Goal" RENAME COLUMN "bloomStatus" TO "status";

-- Index renames (follow table/column renames)
ALTER INDEX IF EXISTS "Branch_userId_idx" RENAME TO "ThemeCategory_userId_idx";
ALTER INDEX IF EXISTS "Branch_userId_themeId_idx" RENAME TO "ThemeCategory_userId_themeId_idx";
ALTER INDEX IF EXISTS "Branch_userId_isActive_idx" RENAME TO "ThemeCategory_userId_isActive_idx";

-- FK constraint renames (parentBranchId FK absent on prod — skip safely)
DO $$ BEGIN
  ALTER TABLE "ThemeCategory" RENAME CONSTRAINT "Branch_spawnedFromBranchId_fkey" TO "ThemeCategory_spawnedFromCategoryId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ThemeCategory" RENAME CONSTRAINT "Branch_userId_fkey" TO "ThemeCategory_userId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
