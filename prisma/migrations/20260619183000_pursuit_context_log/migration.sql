-- CreateEnum
CREATE TYPE "PursuitContextEntryKind" AS ENUM ('clarifier_answer', 'manual_edit', 'stream_digest', 'create', 'ai_merge');

-- CreateEnum
CREATE TYPE "PursuitRelationshipKind" AS ENUM ('related');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "createdFromGoalId" TEXT;

-- CreateTable
CREATE TABLE "PursuitContextEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "kind" "PursuitContextEntryKind" NOT NULL,
    "text" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PursuitContextEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PursuitRelationship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalAId" TEXT NOT NULL,
    "goalBId" TEXT NOT NULL,
    "kind" "PursuitRelationshipKind" NOT NULL DEFAULT 'related',
    "sourceClarifierId" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PursuitRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PursuitContextEntry_goalId_createdAt_idx" ON "PursuitContextEntry"("goalId", "createdAt");

-- CreateIndex
CREATE INDEX "PursuitContextEntry_userId_createdAt_idx" ON "PursuitContextEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Goal_createdFromGoalId_idx" ON "Goal"("createdFromGoalId");

-- CreateIndex
CREATE INDEX "PursuitRelationship_userId_idx" ON "PursuitRelationship"("userId");

-- CreateIndex
CREATE INDEX "PursuitRelationship_goalAId_idx" ON "PursuitRelationship"("goalAId");

-- CreateIndex
CREATE INDEX "PursuitRelationship_goalBId_idx" ON "PursuitRelationship"("goalBId");

-- CreateIndex
CREATE UNIQUE INDEX "PursuitRelationship_userId_goalAId_goalBId_key" ON "PursuitRelationship"("userId", "goalAId", "goalBId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_createdFromGoalId_fkey" FOREIGN KEY ("createdFromGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PursuitContextEntry" ADD CONSTRAINT "PursuitContextEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PursuitContextEntry" ADD CONSTRAINT "PursuitContextEntry_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PursuitRelationship" ADD CONSTRAINT "PursuitRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PursuitRelationship" ADD CONSTRAINT "PursuitRelationship_goalAId_fkey" FOREIGN KEY ("goalAId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PursuitRelationship" ADD CONSTRAINT "PursuitRelationship_goalBId_fkey" FOREIGN KEY ("goalBId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
