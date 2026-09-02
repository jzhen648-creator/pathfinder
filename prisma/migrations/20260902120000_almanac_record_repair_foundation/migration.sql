-- Record repair remains inside the canonical Import -> Place -> Update model.
-- DIRECT imports preserve the exact wording of a user-authorised record action
-- without representing it as an AI response. Existing ALMANAC/1 rows and
-- singular lineage remain valid.
ALTER TYPE "AlmanacImportScope" ADD VALUE IF NOT EXISTS 'DIRECT';

ALTER TABLE "AlmanacImport"
  DROP CONSTRAINT "AlmanacImport_protocol_version";
ALTER TABLE "AlmanacImport"
  ADD CONSTRAINT "AlmanacImport_protocol_version" CHECK (
    (
      "protocolVersion" = 'ALMANAC/1'
      AND "scope"::text IN ('CHAT', 'PROJECT', 'BOOTSTRAP')
    )
    OR (
      "protocolVersion" = 'ALMANAC/USER/1'
      AND "scope"::text = 'DIRECT'
    )
  );

CREATE TYPE "AlmanacUpdateSignificance" AS ENUM ('STANDARD', 'KEY');
CREATE TYPE "AlmanacTargetDatePrecision" AS ENUM ('YEAR', 'MONTH', 'DAY');

ALTER TABLE "AlmanacUpdatePreference"
  ADD COLUMN "significance" "AlmanacUpdateSignificance" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "targetDate" DATE,
  ADD COLUMN "targetDatePrecision" "AlmanacTargetDatePrecision";

ALTER TABLE "AlmanacUpdatePreference"
  ADD CONSTRAINT "AlmanacUpdatePreference_target_date_pair" CHECK (
    ("targetDate" IS NULL AND "targetDatePrecision" IS NULL)
    OR ("targetDate" IS NOT NULL AND "targetDatePrecision" IS NOT NULL)
  ),
  ADD CONSTRAINT "AlmanacUpdatePreference_target_date_canonical" CHECK (
    "targetDate" IS NULL
    OR (
      EXTRACT(YEAR FROM "targetDate") BETWEEN 1 AND 9999
      AND (
        (
          "targetDatePrecision" = 'YEAR'
          AND EXTRACT(MONTH FROM "targetDate") = 1
          AND EXTRACT(DAY FROM "targetDate") = 1
        )
        OR (
          "targetDatePrecision" = 'MONTH'
          AND EXTRACT(DAY FROM "targetDate") = 1
        )
        OR "targetDatePrecision" = 'DAY'
      )
    )
  );

CREATE FUNCTION "enforce_almanac_next_target_date"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  update_state text;
BEGIN
  IF NEW."targetDate" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT update_row."state"::text
    INTO update_state
    FROM public."AlmanacUpdate" AS update_row
   WHERE update_row."id" = NEW."updateId"
     AND update_row."userId" = NEW."userId";

  IF update_state IS DISTINCT FROM 'NEXT' THEN
    RAISE EXCEPTION 'Only a NEXT Almanac Update can have a target date'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AlmanacUpdatePreference_next_target_date"
BEFORE INSERT OR UPDATE ON "AlmanacUpdatePreference"
FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_next_target_date"();

-- One successor may explicitly retire several selected predecessors. The
-- singular AlmanacUpdate.supersedesUpdateId remains for deployed compatibility
-- and is backfilled into this authoritative append-only edge set.
CREATE TABLE "AlmanacUpdateSupersession" (
  "successorUpdateId" TEXT NOT NULL,
  "predecessorUpdateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AlmanacUpdateSupersession_pkey"
    PRIMARY KEY ("successorUpdateId", "predecessorUpdateId"),
  CONSTRAINT "AlmanacUpdateSupersession_no_self_edge"
    CHECK ("successorUpdateId" <> "predecessorUpdateId")
);

CREATE INDEX "AlmanacUpdateSupersession_userId_predecessorUpdateId_idx"
  ON "AlmanacUpdateSupersession"("userId", "predecessorUpdateId");
CREATE INDEX "AlmanacUpdateSupersession_userId_successorUpdateId_idx"
  ON "AlmanacUpdateSupersession"("userId", "successorUpdateId");

ALTER TABLE "AlmanacUpdateSupersession"
  ADD CONSTRAINT "AlmanacUpdateSupersession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdateSupersession"
  ADD CONSTRAINT "AlmanacUpdateSupersession_successorUpdateId_userId_fkey"
  FOREIGN KEY ("successorUpdateId", "userId")
  REFERENCES "AlmanacUpdate"("id", "userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdateSupersession"
  ADD CONSTRAINT "AlmanacUpdateSupersession_predecessorUpdateId_userId_fkey"
  FOREIGN KEY ("predecessorUpdateId", "userId")
  REFERENCES "AlmanacUpdate"("id", "userId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every deployed singular lineage edge before enforcing the stricter
-- presented-Subject rule for new writes. Older builds allowed a valid
-- combine -> cross-Place supersede -> unmerge sequence, so historical rows may
-- now span underlying Places that are no longer presented together.
INSERT INTO "AlmanacUpdateSupersession" (
  "successorUpdateId",
  "predecessorUpdateId",
  "userId",
  "createdAt"
)
SELECT
  update_row."id",
  update_row."supersedesUpdateId",
  update_row."userId",
  update_row."createdAt"
FROM "AlmanacUpdate" AS update_row
WHERE update_row."supersedesUpdateId" IS NOT NULL
ON CONFLICT ("successorUpdateId", "predecessorUpdateId") DO NOTHING;

CREATE FUNCTION "enforce_almanac_supersession_edge_integrity"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  successor_subject_id text;
  predecessor_subject_id text;
BEGIN
  SELECT COALESCE(preference."mergedIntoPlaceId", update_row."placeId")
    INTO successor_subject_id
    FROM public."AlmanacUpdate" AS update_row
    LEFT JOIN public."AlmanacSubjectPreference" AS preference
      ON preference."placeId" = update_row."placeId"
     AND preference."userId" = update_row."userId"
   WHERE update_row."id" = NEW."successorUpdateId"
     AND update_row."userId" = NEW."userId";

  SELECT COALESCE(preference."mergedIntoPlaceId", update_row."placeId")
    INTO predecessor_subject_id
    FROM public."AlmanacUpdate" AS update_row
    LEFT JOIN public."AlmanacSubjectPreference" AS preference
      ON preference."placeId" = update_row."placeId"
     AND preference."userId" = update_row."userId"
   WHERE update_row."id" = NEW."predecessorUpdateId"
     AND update_row."userId" = NEW."userId";

  IF successor_subject_id IS NULL OR predecessor_subject_id IS NULL THEN
    RAISE EXCEPTION 'Almanac supersession Updates must belong to the same owner'
      USING ERRCODE = '23503';
  END IF;
  IF successor_subject_id IS DISTINCT FROM predecessor_subject_id THEN
    RAISE EXCEPTION 'Almanac supersession cannot cross Subjects'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AlmanacUpdateSupersession_integrity"
BEFORE INSERT OR UPDATE ON "AlmanacUpdateSupersession"
FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_supersession_edge_integrity"();

CREATE TRIGGER "AlmanacUpdateSupersession_append_only"
BEFORE UPDATE ON "AlmanacUpdateSupersession"
FOR EACH ROW EXECUTE FUNCTION "reject_almanac_history_update"();

-- The Next.js service remains the sole write path. RLS is defence in depth;
-- Data API roles receive no grants or policies.
ALTER TABLE "AlmanacUpdateSupersession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM service_role';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_next_target_date"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_supersession_edge_integrity"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_next_target_date"(), "enforce_almanac_supersession_edge_integrity"() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_next_target_date"(), "enforce_almanac_supersession_edge_integrity"() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_next_target_date"(), "enforce_almanac_supersession_edge_integrity"() FROM service_role';
  END IF;
END
$$;
