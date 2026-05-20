-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BloomStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETE');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('active', 'paused', 'achieved', 'abandoned');

-- CreateEnum
CREATE TYPE "MarkSentiment" AS ENUM ('positive', 'neutral', 'negative');

-- CreateEnum
CREATE TYPE "TrunkCategory" AS ENUM ('FAMILY', 'EDUCATION', 'CULTURE_RELIGION', 'SOCIOECONOMIC', 'EARLY_HEALTH', 'FORMATIVE', 'PLACE');

-- CreateEnum
CREATE TYPE "TrunkEntrySource" AS ENUM ('MANUAL', 'VOICE', 'DOCUMENT', 'AI_EXTRACTED');

-- CreateEnum
CREATE TYPE "StreamInputMode" AS ENUM ('text', 'voice');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "birthYear" INTEGER,
    "birthPlace" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingPrimaryLimbId" TEXT,
    "firstRunCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingProfileText" TEXT,
    "onboardingProfileData" JSONB,
    "careerEducationContextText" TEXT,
    "lifeWheelRatings" JSONB,
    "lifeWheelHistory" JSONB,
    "lifeWheelAchievementAt" TIMESTAMP(3),
    "hubTaxonomyVersion" TEXT,
    "hubTaxonomySyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "label" TEXT,
    "parentBranchId" TEXT,
    "turningPointId" TEXT,
    "mapAngleOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "name" TEXT,
    "goal" TEXT,
    "goalValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "unit" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isSystemHub" BOOLEAN NOT NULL DEFAULT false,
    "bloomStatus" "BloomStatus" NOT NULL DEFAULT 'ACTIVE',
    "bloomedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "spawnedFromBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "sentiment" "MarkSentiment" NOT NULL DEFAULT 'neutral',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "significance" INTEGER NOT NULL DEFAULT 1,
    "future" BOOLEAN NOT NULL DEFAULT false,
    "isTurningPoint" BOOLEAN NOT NULL DEFAULT false,
    "parentMarkId" TEXT,
    "location" TEXT,
    "timelineNote" TEXT,
    "subtype" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "sequencePosition" DOUBLE PRECISION,
    "kind" TEXT NOT NULL DEFAULT 'mark',
    "needsResolution" BOOLEAN NOT NULL DEFAULT false,
    "streamAmbiguousId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reframe" (
    "id" TEXT NOT NULL,
    "markId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reframe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "inputMode" "StreamInputMode" NOT NULL,
    "itemsAdded" INTEGER NOT NULL,
    "itemsSkipped" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortLabel" TEXT,
    "description" TEXT NOT NULL,
    "lifeArea" TEXT NOT NULL DEFAULT 'Other',
    "goalType" TEXT NOT NULL DEFAULT 'action',
    "targetAmount" DOUBLE PRECISION,
    "currentAmount" DOUBLE PRECISION,
    "unit" TEXT,
    "deadline" TIMESTAMP(3),
    "timelineStart" TIMESTAMP(3),
    "roadmapJson" JSONB,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "bloomStatus" "BloomStatus" NOT NULL DEFAULT 'ACTIVE',
    "bloomedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "parentGoalId" TEXT,
    "positionAngle" DOUBLE PRECISION,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "month" INTEGER,
    "mapPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sequencePosition" DOUBLE PRECISION,
    "significance" INTEGER NOT NULL DEFAULT 1,
    "future" BOOLEAN NOT NULL DEFAULT false,
    "isTurningPoint" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "timelineNote" TEXT,
    "subtype" TEXT,
    "limbId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalEvaluationCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "evaluation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalEvaluationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "goalId" TEXT NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "milestoneId" TEXT NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quickWinId" TEXT NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quickWinId" TEXT NOT NULL,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrunkSegment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "TrunkCategory" NOT NULL,
    "richness" INTEGER NOT NULL DEFAULT 0,
    "heightScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrunkSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrunkEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trunkSegmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "year" INTEGER,
    "significance" INTEGER NOT NULL DEFAULT 3,
    "source" "TrunkEntrySource" NOT NULL DEFAULT 'MANUAL',
    "aiSummary" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrunkEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Branch_userId_idx" ON "Branch"("userId");

-- CreateIndex
CREATE INDEX "Branch_userId_limbId_idx" ON "Branch"("userId", "limbId");

-- CreateIndex
CREATE INDEX "Branch_userId_isActive_idx" ON "Branch"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Mark_userId_idx" ON "Mark"("userId");

-- CreateIndex
CREATE INDEX "Mark_branchId_idx" ON "Mark"("branchId");

-- CreateIndex
CREATE INDEX "Mark_limbId_idx" ON "Mark"("limbId");

-- CreateIndex
CREATE INDEX "Mark_archived_idx" ON "Mark"("archived");

-- CreateIndex
CREATE INDEX "Mark_date_idx" ON "Mark"("date");

-- CreateIndex
CREATE INDEX "Mark_parentMarkId_idx" ON "Mark"("parentMarkId");

-- CreateIndex
CREATE INDEX "Mark_branchId_sequencePosition_idx" ON "Mark"("branchId", "sequencePosition");

-- CreateIndex
CREATE INDEX "Reframe_markId_idx" ON "Reframe"("markId");

-- CreateIndex
CREATE INDEX "Reframe_date_idx" ON "Reframe"("date");

-- CreateIndex
CREATE INDEX "StreamSession_userId_limbId_createdAt_idx" ON "StreamSession"("userId", "limbId", "createdAt");

-- CreateIndex
CREATE INDEX "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");

-- CreateIndex
CREATE INDEX "Goal_branchId_idx" ON "Goal"("branchId");

-- CreateIndex
CREATE INDEX "Goal_limbId_idx" ON "Goal"("limbId");

-- CreateIndex
CREATE INDEX "Goal_archived_idx" ON "Goal"("archived");

-- CreateIndex
CREATE INDEX "Goal_branchId_sequencePosition_idx" ON "Goal"("branchId", "sequencePosition");

-- CreateIndex
CREATE INDEX "GoalEvaluationCache_userId_idx" ON "GoalEvaluationCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalEvaluationCache_userId_inputHash_key" ON "GoalEvaluationCache"("userId", "inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_goalId_position_key" ON "Milestone"("goalId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Subtask_milestoneId_position_key" ON "Subtask"("milestoneId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_quickWinId_position_key" ON "DailyTask"("quickWinId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Checkpoint_quickWinId_position_key" ON "Checkpoint"("quickWinId", "position");

-- CreateIndex
CREATE INDEX "TrunkSegment_userId_idx" ON "TrunkSegment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrunkSegment_userId_category_key" ON "TrunkSegment"("userId", "category");

-- CreateIndex
CREATE INDEX "TrunkEntry_trunkSegmentId_idx" ON "TrunkEntry"("trunkSegmentId");

-- CreateIndex
CREATE INDEX "TrunkEntry_userId_idx" ON "TrunkEntry"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_spawnedFromBranchId_fkey" FOREIGN KEY ("spawnedFromBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_parentMarkId_fkey" FOREIGN KEY ("parentMarkId") REFERENCES "Mark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reframe" ADD CONSTRAINT "Reframe_markId_fkey" FOREIGN KEY ("markId") REFERENCES "Mark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSession" ADD CONSTRAINT "StreamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEvaluationCache" ADD CONSTRAINT "GoalEvaluationCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_quickWinId_fkey" FOREIGN KEY ("quickWinId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_quickWinId_fkey" FOREIGN KEY ("quickWinId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrunkSegment" ADD CONSTRAINT "TrunkSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrunkEntry" ADD CONSTRAINT "TrunkEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrunkEntry" ADD CONSTRAINT "TrunkEntry_trunkSegmentId_fkey" FOREIGN KEY ("trunkSegmentId") REFERENCES "TrunkSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
