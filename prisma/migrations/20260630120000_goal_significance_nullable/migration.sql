-- Make Goal.significance nullable; existing rows keep their values.
ALTER TABLE "Goal" ALTER COLUMN "significance" DROP NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "significance" DROP DEFAULT;
