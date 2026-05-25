-- CreateTable
CREATE TABLE "InsightCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "globalInsight" TEXT NOT NULL,
    "themeInsights" JSONB NOT NULL,
    "hubInsights" JSONB NOT NULL,
    "pursuitInsights" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mapVersion" TEXT NOT NULL,
    "memoryVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightCache_userId_key" ON "InsightCache"("userId");

-- AddForeignKey
ALTER TABLE "InsightCache" ADD CONSTRAINT "InsightCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
