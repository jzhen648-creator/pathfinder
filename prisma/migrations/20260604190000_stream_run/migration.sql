-- CreateEnum
CREATE TYPE "StreamRunStatus" AS ENUM ('pending', 'applied', 'failed', 'undone');

-- CreateTable
CREATE TABLE "StreamRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "rawInput" TEXT NOT NULL,
    "inputMode" "StreamInputMode" NOT NULL DEFAULT 'text',
    "status" "StreamRunStatus" NOT NULL DEFAULT 'pending',
    "previousDescription" TEXT,
    "previousBloomStatus" "BloomStatus",
    "summaryJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN "sourceStreamRunId" TEXT;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN "sourceStreamRunId" TEXT;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "sourceStreamRunId" TEXT;

-- CreateIndex
CREATE INDEX "StreamRun_userId_goalId_createdAt_idx" ON "StreamRun"("userId", "goalId", "createdAt");

-- CreateIndex
CREATE INDEX "StreamRun_userId_expiresAt_idx" ON "StreamRun"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Mark_sourceStreamRunId_idx" ON "Mark"("sourceStreamRunId");

-- CreateIndex
CREATE INDEX "Milestone_sourceStreamRunId_idx" ON "Milestone"("sourceStreamRunId");

-- CreateIndex
CREATE INDEX "Goal_sourceStreamRunId_idx" ON "Goal"("sourceStreamRunId");

-- AddForeignKey
ALTER TABLE "StreamRun" ADD CONSTRAINT "StreamRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_sourceStreamRunId_fkey" FOREIGN KEY ("sourceStreamRunId") REFERENCES "StreamRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_sourceStreamRunId_fkey" FOREIGN KEY ("sourceStreamRunId") REFERENCES "StreamRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
