-- Drop retired desktop-era tables and columns (mobile-only schema).

-- Clean rows that reference retiring enum values / FKs
DELETE FROM "AiReadingDirtyItem" WHERE "entityType" IN ('mark', 'hub');
DELETE FROM "PursuitContextEntry" WHERE "kind" = 'stream_digest';
DELETE FROM "ProfileFact" WHERE "source" = 'stream_extracted';

-- Drop stream FK columns before dropping StreamRun
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "sourceStreamRunId";
ALTER TABLE "Milestone" DROP COLUMN IF EXISTS "sourceStreamRunId";

-- Drop dependent tables (deepest FKs first)
DROP TABLE IF EXISTS "DailyTask" CASCADE;
DROP TABLE IF EXISTS "Checkpoint" CASCADE;
DROP TABLE IF EXISTS "Subtask" CASCADE;
DROP TABLE IF EXISTS "Reframe" CASCADE;
DROP TABLE IF EXISTS "Mark" CASCADE;
DROP TABLE IF EXISTS "StreamRun" CASCADE;
DROP TABLE IF EXISTS "StreamSession" CASCADE;
DROP TABLE IF EXISTS "TrunkEntry" CASCADE;
DROP TABLE IF EXISTS "TrunkSegment" CASCADE;
DROP TABLE IF EXISTS "StoryCache" CASCADE;
DROP TABLE IF EXISTS "GoalEvaluationCache" CASCADE;

-- Goal legacy columns
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "roadmapJson";
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "positionAngle";
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "mapPosition";

-- ThemeCategory legacy columns / self-FK
ALTER TABLE "ThemeCategory" DROP CONSTRAINT IF EXISTS "ThemeCategory_spawnedFromCategoryId_fkey";
ALTER TABLE "ThemeCategory" DROP CONSTRAINT IF EXISTS "ThemeCategory_parentCategoryId_fkey";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "parentCategoryId";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "turningPointId";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "name";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "goal";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "goalValue";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "currentValue";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "unit";
ALTER TABLE "ThemeCategory" DROP COLUMN IF EXISTS "spawnedFromCategoryId";

-- User desktop onboarding / life wheel
ALTER TABLE "User" DROP COLUMN IF EXISTS "onboardingScene";
ALTER TABLE "User" DROP COLUMN IF EXISTS "onboardingHubSlug";
ALTER TABLE "User" DROP COLUMN IF EXISTS "onboardingPrimaryLimbId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "firstRunCompleted";
ALTER TABLE "User" DROP COLUMN IF EXISTS "onboardingProfileText";
ALTER TABLE "User" DROP COLUMN IF EXISTS "onboardingProfileData";
ALTER TABLE "User" DROP COLUMN IF EXISTS "careerEducationContextText";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lifeWheelRatings";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lifeWheelHistory";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lifeWheelAchievementAt";

-- UserMemory stream counter
ALTER TABLE "UserMemory" DROP COLUMN IF EXISTS "streamSessionCount";

-- Dirty ledger stream FK
ALTER TABLE "AiReadingDirtyItem" DROP COLUMN IF EXISTS "streamRunId";

-- Enum: AiReadingDirtyEntityType (drop mark, hub)
CREATE TYPE "AiReadingDirtyEntityType_new" AS ENUM ('pursuit', 'theme', 'global');
ALTER TABLE "AiReadingDirtyItem"
  ALTER COLUMN "entityType" TYPE "AiReadingDirtyEntityType_new"
  USING ("entityType"::text::"AiReadingDirtyEntityType_new");
DROP TYPE "AiReadingDirtyEntityType";
ALTER TYPE "AiReadingDirtyEntityType_new" RENAME TO "AiReadingDirtyEntityType";

-- Enum: PursuitContextEntryKind (drop stream_digest)
CREATE TYPE "PursuitContextEntryKind_new" AS ENUM ('clarifier_answer', 'manual_edit', 'create', 'ai_merge');
ALTER TABLE "PursuitContextEntry"
  ALTER COLUMN "kind" TYPE "PursuitContextEntryKind_new"
  USING ("kind"::text::"PursuitContextEntryKind_new");
DROP TYPE "PursuitContextEntryKind";
ALTER TYPE "PursuitContextEntryKind_new" RENAME TO "PursuitContextEntryKind";

-- Enum: ProfileFactSource (user_manual only)
ALTER TABLE "ProfileFact" ALTER COLUMN "source" DROP DEFAULT;
CREATE TYPE "ProfileFactSource_new" AS ENUM ('user_manual');
ALTER TABLE "ProfileFact"
  ALTER COLUMN "source" TYPE "ProfileFactSource_new"
  USING ('user_manual'::"ProfileFactSource_new");
DROP TYPE "ProfileFactSource";
ALTER TYPE "ProfileFactSource_new" RENAME TO "ProfileFactSource";
ALTER TABLE "ProfileFact" ALTER COLUMN "source" SET DEFAULT 'user_manual'::"ProfileFactSource";

-- Retired enums (no remaining columns)
DROP TYPE IF EXISTS "MarkSentiment";
DROP TYPE IF EXISTS "StreamInputMode";
DROP TYPE IF EXISTS "StreamRunStatus";
DROP TYPE IF EXISTS "TrunkCategory";
DROP TYPE IF EXISTS "TrunkEntrySource";
