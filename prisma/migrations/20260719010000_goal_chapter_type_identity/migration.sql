-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "chapterType" TEXT,
ADD COLUMN "identityFacts" JSONB,
ADD COLUMN "currentFocus" TEXT;
