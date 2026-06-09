-- Persist mobile map hex coordinates (world axial q,r) for pursuit placement.
ALTER TABLE "Goal" ADD COLUMN "mapGridQ" INTEGER;
ALTER TABLE "Goal" ADD COLUMN "mapGridR" INTEGER;
