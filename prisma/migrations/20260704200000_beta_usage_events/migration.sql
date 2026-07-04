-- CreateTable
CREATE TABLE "BetaUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetaUsageEvent_userId_createdAt_idx" ON "BetaUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BetaUsageEvent_name_createdAt_idx" ON "BetaUsageEvent"("name", "createdAt");

-- AddForeignKey
ALTER TABLE "BetaUsageEvent" ADD CONSTRAINT "BetaUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
