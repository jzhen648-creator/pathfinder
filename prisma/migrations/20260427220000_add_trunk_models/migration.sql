-- CreateTable
CREATE TABLE "TrunkSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "richness" INTEGER NOT NULL DEFAULT 0,
    "heightScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrunkSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrunkEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "trunkSegmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "year" INTEGER,
    "significance" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "aiSummary" TEXT,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrunkEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrunkEntry_trunkSegmentId_fkey" FOREIGN KEY ("trunkSegmentId") REFERENCES "TrunkSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrunkSegment_userId_idx" ON "TrunkSegment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrunkSegment_userId_category_key" ON "TrunkSegment"("userId", "category");

-- CreateIndex
CREATE INDEX "TrunkEntry_trunkSegmentId_idx" ON "TrunkEntry"("trunkSegmentId");

-- CreateIndex
CREATE INDEX "TrunkEntry_userId_idx" ON "TrunkEntry"("userId");
