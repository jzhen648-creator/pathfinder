-- Drop legacy `Goal.treeMilestones` JSON column (milestones are relational only).
ALTER TABLE "Goal" DROP COLUMN "treeMilestones";
