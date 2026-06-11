-- Postgres: new enum values must commit before use — data backfill is in the next migration.
ALTER TYPE "BloomStatus" ADD VALUE 'PAUSED';
ALTER TYPE "BloomStatus" ADD VALUE 'ABANDONED';
