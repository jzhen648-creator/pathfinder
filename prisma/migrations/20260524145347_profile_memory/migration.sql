-- CreateEnum
CREATE TYPE "ProfileFactCategory" AS ENUM ('personal', 'career', 'financial', 'health', 'relationships', 'preferences', 'strengths');

-- CreateEnum
CREATE TYPE "ProfileFactSource" AS ENUM ('stream_extracted', 'user_manual');

-- AlterTable
ALTER TABLE "StreamSession" ADD COLUMN     "processedForProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "processedForProfileAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProfileFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ProfileFactCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" "ProfileFactSource" NOT NULL DEFAULT 'stream_extracted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileFact_userId_category_idx" ON "ProfileFact"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFact_userId_category_key_key" ON "ProfileFact"("userId", "category", "key");

-- CreateIndex
CREATE INDEX "StreamSession_userId_processedForProfile_createdAt_idx" ON "StreamSession"("userId", "processedForProfile", "createdAt");

-- AddForeignKey
ALTER TABLE "ProfileFact" ADD CONSTRAINT "ProfileFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
