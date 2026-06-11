-- Backfill after PAUSED exists on BloomStatus (separate migration transaction).
UPDATE "Goal"
SET "bloomStatus" = 'PAUSED'
WHERE "bloomStatus" = 'ON_HOLD';
