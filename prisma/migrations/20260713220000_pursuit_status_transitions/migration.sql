-- CreateTable
CREATE TABLE "PursuitStatusTransition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "fromStatus" "PursuitStatus" NOT NULL,
    "toStatus" "PursuitStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PursuitStatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PursuitStatusTransition_goalId_at_idx" ON "PursuitStatusTransition"("goalId", "at");

-- CreateIndex
CREATE INDEX "PursuitStatusTransition_userId_at_idx" ON "PursuitStatusTransition"("userId", "at");

-- AddForeignKey
ALTER TABLE "PursuitStatusTransition" ADD CONSTRAINT "PursuitStatusTransition_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
