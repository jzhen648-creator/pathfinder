-- merge-moment-fields-into-mark
-- Redefine Mark to add tree/moment fields and self-relation; preserve existing row data
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Mark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "limbId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mark_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mark_parentMarkId_fkey" FOREIGN KEY ("parentMarkId") REFERENCES "new_Mark" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Mark" (
    "id", "branchId", "limbId", "userId", "title", "description", "date", "type", "value", "sentiment", "archived",
    "significance", "future", "isTurningPoint", "parentMarkId", "location", "timelineNote", "subtype", "year", "month",
    "createdAt", "updatedAt"
) SELECT
    "id", "branchId", "limbId", "userId", "title", "description", "date", "type", "value", "sentiment", "archived",
    1 AS "significance", false AS "future", false AS "isTurningPoint", NULL AS "parentMarkId", NULL AS "location", NULL AS "timelineNote", NULL AS "subtype", NULL AS "year", NULL AS "month",
    "createdAt", "updatedAt"
FROM "Mark";
DROP TABLE "Mark";
ALTER TABLE "new_Mark" RENAME TO "Mark";
CREATE INDEX "Mark_userId_idx" ON "Mark"("userId");
CREATE INDEX "Mark_branchId_idx" ON "Mark"("branchId");
CREATE INDEX "Mark_limbId_idx" ON "Mark"("limbId");
CREATE INDEX "Mark_archived_idx" ON "Mark"("archived");
CREATE INDEX "Mark_date_idx" ON "Mark"("date");
CREATE INDEX "Mark_parentMarkId_idx" ON "Mark"("parentMarkId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
