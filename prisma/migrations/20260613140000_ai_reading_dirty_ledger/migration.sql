-- CreateEnum
CREATE TYPE "AiReadingDirtyEntityType" AS ENUM ('pursuit', 'theme', 'hub', 'mark', 'global');

-- CreateTable
CREATE TABLE "AiReadingDirtyItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "AiReadingDirtyEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "streamRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReadingDirtyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReadingDirtyItem_userId_createdAt_idx" ON "AiReadingDirtyItem"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiReadingDirtyItem_userId_entityType_entityId_key" ON "AiReadingDirtyItem"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AiReadingDirtyItem" ADD CONSTRAINT "AiReadingDirtyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
