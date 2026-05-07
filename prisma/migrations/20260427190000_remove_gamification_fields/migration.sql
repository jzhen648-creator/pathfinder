-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "birthYear" INTEGER,
    "birthPlace" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingProfileText" TEXT,
    "onboardingProfileData" JSONB,
    "careerEducationContextText" TEXT,
    "lifeWheelRatings" JSONB,
    "lifeWheelHistory" JSONB,
    "lifeWheelAchievementAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("birthPlace", "birthYear", "careerEducationContextText", "createdAt", "email", "id", "lifeWheelAchievementAt", "lifeWheelHistory", "lifeWheelRatings", "name", "onboardingCompleted", "onboardingProfileData", "onboardingProfileText", "passwordHash", "updatedAt") SELECT "birthPlace", "birthYear", "careerEducationContextText", "createdAt", "email", "id", "lifeWheelAchievementAt", "lifeWheelHistory", "lifeWheelRatings", "name", "onboardingCompleted", "onboardingProfileData", "onboardingProfileText", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lifeArea" TEXT NOT NULL DEFAULT 'Other',
    "goalType" TEXT NOT NULL DEFAULT 'action',
    "targetAmount" REAL,
    "currentAmount" REAL,
    "deadline" DATETIME NOT NULL,
    "roadmapJson" JSONB,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("aiGenerated", "createdAt", "currentAmount", "deadline", "description", "goalType", "id", "lifeArea", "roadmapJson", "targetAmount", "title", "updatedAt", "userId") SELECT "aiGenerated", "createdAt", "currentAmount", "deadline", "description", "goalType", "id", "lifeArea", "roadmapJson", "targetAmount", "title", "updatedAt", "userId" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
