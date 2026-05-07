-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "label" TEXT,
    "parentBranchId" TEXT,
    "turningPointId" TEXT,
    "mapAngleOffset" REAL NOT NULL DEFAULT 0,
    "name" TEXT,
    "goal" TEXT,
    "goalValue" REAL,
    "currentValue" REAL,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "order" INTEGER NOT NULL DEFAULT 0,
    "bloomStatus" TEXT NOT NULL DEFAULT 'BUD',
    "bloomedAt" DATETIME,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "spawnedFromBranchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Branch_spawnedFromBranchId_fkey" FOREIGN KEY ("spawnedFromBranchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("createdAt", "currentValue", "goal", "goalValue", "id", "label", "limbId", "mapAngleOffset", "name", "order", "parentBranchId", "status", "turningPointId", "unit", "updatedAt", "userId") SELECT "createdAt", "currentValue", "goal", "goalValue", "id", "label", "limbId", "mapAngleOffset", "name", "order", "parentBranchId", "status", "turningPointId", "unit", "updatedAt", "userId" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE INDEX "Branch_userId_idx" ON "Branch"("userId");
CREATE INDEX "Branch_userId_limbId_idx" ON "Branch"("userId", "limbId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
