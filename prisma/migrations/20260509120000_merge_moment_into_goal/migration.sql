-- Merge Prisma Moment into Goal: widen Goal, copy rows, drop Moment.
-- SAFETY: Backup database before apply. Verify counts after INSERT from Moment, before DROP Moment.
-- Verification (run manually on a copy):
--   SELECT (SELECT COUNT(*) FROM Moment) AS moment_count;
--   SELECT COUNT(*) FROM new_Goal WHERE "goalType" IN ('moment', 'event') AND "id" IN (SELECT "id" FROM Moment);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lifeArea" TEXT NOT NULL DEFAULT 'Other',
    "goalType" TEXT NOT NULL DEFAULT 'action',
    "targetAmount" REAL,
    "currentAmount" REAL,
    "deadline" DATETIME,
    "roadmapJson" JSONB,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "bloomStatus" TEXT NOT NULL DEFAULT 'BUD',
    "bloomedAt" DATETIME,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "parentGoalId" TEXT,
    "positionAngle" REAL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "month" INTEGER,
    "mapPosition" REAL NOT NULL DEFAULT 0,
    "significance" INTEGER NOT NULL DEFAULT 1,
    "future" BOOLEAN NOT NULL DEFAULT false,
    "isTurningPoint" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "timelineNote" TEXT,
    "subtype" TEXT,
    "limbId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    CONSTRAINT "new_Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "new_Goal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "new_Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "new_Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Goal" (
    "id", "title", "description", "lifeArea", "goalType", "targetAmount", "currentAmount", "deadline",
    "roadmapJson", "aiGenerated", "bloomStatus", "bloomedAt", "endedAt", "endReason", "parentGoalId", "positionAngle",
    "year", "month", "mapPosition", "significance", "future", "isTurningPoint", "location", "timelineNote", "subtype", "limbId",
    "createdAt", "updatedAt", "userId", "branchId"
)
SELECT
    "id", "title", "description", "lifeArea", "goalType", "targetAmount", "currentAmount", "deadline",
    "roadmapJson", "aiGenerated", "bloomStatus", "bloomedAt", "endedAt", "endReason", "parentGoalId", "positionAngle",
    2026, NULL, 0, 1, 0, 0, NULL, NULL, NULL, NULL,
    "createdAt", "updatedAt", "userId", "branchId"
FROM "Goal";

INSERT INTO "new_Goal" (
    "id", "title", "description", "lifeArea", "goalType", "targetAmount", "currentAmount", "deadline",
    "roadmapJson", "aiGenerated", "bloomStatus", "bloomedAt", "endedAt", "endReason", "parentGoalId", "positionAngle",
    "year", "month", "mapPosition", "significance", "future", "isTurningPoint", "location", "timelineNote", "subtype", "limbId",
    "createdAt", "updatedAt", "userId", "branchId"
)
SELECT
    m."id",
    m."label",
    COALESCE(m."description", ''),
    CASE m."limbId"
        WHEN 'finance' THEN 'Money & Finance'
        WHEN 'work' THEN 'Work & Learning'
        WHEN 'becoming' THEN 'Who I''m Becoming'
        WHEN 'people' THEN 'People & Relationships'
        WHEN 'health' THEN 'Health & Body'
        ELSE 'Other'
    END,
    CASE WHEN m."future" != 0 THEN 'event' ELSE 'moment' END,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    CASE
        WHEN m."future" != 0 OR m."year" > CAST(strftime('%Y', 'now') AS INTEGER) THEN 'BUD'
        ELSE 'BLOOMED'
    END,
    CASE
        WHEN m."future" = 0 AND m."year" <= CAST(strftime('%Y', 'now') AS INTEGER) THEN m."updatedAt"
        ELSE NULL
    END,
    NULL,
    NULL,
    m."parentMomentId",
    NULL,
    m."year",
    m."month",
    m."mapPosition",
    m."significance",
    m."future",
    m."isTurningPoint",
    m."location",
    m."timelineNote",
    m."subtype",
    m."limbId",
    m."createdAt",
    m."updatedAt",
    m."userId",
    m."branchId"
FROM "Moment" m
WHERE NOT EXISTS (SELECT 1 FROM "new_Goal" g WHERE g."id" = m."id");

DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";

CREATE INDEX "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");
CREATE INDEX "Goal_branchId_idx" ON "Goal"("branchId");
CREATE INDEX "Goal_limbId_idx" ON "Goal"("limbId");

DROP TABLE "Moment";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
