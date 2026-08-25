-- Persisted Import -> Place -> Update dogfood core. This migration is additive:
-- it neither reads nor writes any legacy Almanac/V1 table.
CREATE TYPE "AlmanacImportScope" AS ENUM ('CHAT', 'PROJECT', 'BOOTSTRAP');
CREATE TYPE "AlmanacUpdateState" AS ENUM ('NOW', 'NEXT', 'OPEN', 'DONE');

CREATE TABLE "AlmanacImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL DEFAULT 'ALMANAC/1',
    "scope" "AlmanacImportScope" NOT NULL,
    "rawPacket" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "AlmanacImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AlmanacImport_protocol_version" CHECK ("protocolVersion" = 'ALMANAC/1'),
    CONSTRAINT "AlmanacImport_idempotency_key_length" CHECK (char_length("idempotencyKey") BETWEEN 8 AND 128),
    CONSTRAINT "AlmanacImport_raw_packet_length" CHECK (char_length("rawPacket") BETWEEN 1 AND 20000),
    CONSTRAINT "AlmanacImport_receipt_object" CHECK (jsonb_typeof("receipt") = 'object')
);

CREATE TABLE "AlmanacPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalisedName" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlmanacPlace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AlmanacPlace_name_length" CHECK (char_length("name") BETWEEN 1 AND 80),
    CONSTRAINT "AlmanacPlace_normalised_name_length" CHECK (char_length("normalisedName") BETWEEN 1 AND 80),
    CONSTRAINT "AlmanacPlace_slot_range" CHECK ("slot" >= 0 AND "slot" < 64)
);

CREATE TABLE "AlmanacUpdate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "state" "AlmanacUpdateState" NOT NULL,
    "text" TEXT NOT NULL,
    "normalisedFingerprint" TEXT NOT NULL,
    "sourceLineNumber" INTEGER NOT NULL,
    "supersedesUpdateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlmanacUpdate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AlmanacUpdate_text_length" CHECK (char_length("text") BETWEEN 1 AND 500),
    CONSTRAINT "AlmanacUpdate_fingerprint_length" CHECK (char_length("normalisedFingerprint") BETWEEN 1 AND 520),
    CONSTRAINT "AlmanacUpdate_source_line" CHECK ("sourceLineNumber" >= 3),
    CONSTRAINT "AlmanacUpdate_no_self_supersession" CHECK ("supersedesUpdateId" IS NULL OR "supersedesUpdateId" <> "id")
);

CREATE UNIQUE INDEX "AlmanacImport_userId_idempotencyKey_key" ON "AlmanacImport"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "AlmanacImport_id_userId_key" ON "AlmanacImport"("id", "userId");
CREATE INDEX "AlmanacImport_userId_createdAt_idx" ON "AlmanacImport"("userId", "createdAt");
CREATE UNIQUE INDEX "AlmanacPlace_userId_normalisedName_key" ON "AlmanacPlace"("userId", "normalisedName");
CREATE UNIQUE INDEX "AlmanacPlace_userId_slot_key" ON "AlmanacPlace"("userId", "slot");
CREATE UNIQUE INDEX "AlmanacPlace_id_userId_key" ON "AlmanacPlace"("id", "userId");
CREATE UNIQUE INDEX "AlmanacUpdate_importId_sourceLineNumber_key" ON "AlmanacUpdate"("importId", "sourceLineNumber");
CREATE UNIQUE INDEX "AlmanacUpdate_id_userId_key" ON "AlmanacUpdate"("id", "userId");
CREATE INDEX "AlmanacUpdate_userId_placeId_state_createdAt_idx" ON "AlmanacUpdate"("userId", "placeId", "state", "createdAt");
CREATE INDEX "AlmanacUpdate_userId_importId_idx" ON "AlmanacUpdate"("userId", "importId");
CREATE INDEX "AlmanacUpdate_userId_supersedesUpdateId_idx" ON "AlmanacUpdate"("userId", "supersedesUpdateId");

ALTER TABLE "AlmanacImport" ADD CONSTRAINT "AlmanacImport_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacPlace" ADD CONSTRAINT "AlmanacPlace_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdate" ADD CONSTRAINT "AlmanacUpdate_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdate" ADD CONSTRAINT "AlmanacUpdate_importId_userId_fkey"
FOREIGN KEY ("importId", "userId") REFERENCES "AlmanacImport"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdate" ADD CONSTRAINT "AlmanacUpdate_placeId_userId_fkey"
FOREIGN KEY ("placeId", "userId") REFERENCES "AlmanacPlace"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdate" ADD CONSTRAINT "AlmanacUpdate_supersedesUpdateId_userId_fkey"
FOREIGN KEY ("supersedesUpdateId", "userId") REFERENCES "AlmanacUpdate"("id", "userId")
ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- The Next.js API is the sole access path. RLS is defence in depth and the
-- Data API roles receive no grants or policies for these tables.
ALTER TABLE "AlmanacImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlmanacPlace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlmanacUpdate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacImport", "AlmanacPlace", "AlmanacUpdate" FROM authenticated';
    END IF;
END
$$;

-- Provenance is immutable at the database boundary. Undo is the sole allowed
-- mutation on an Import, and it can move only once from active to undone.
CREATE FUNCTION "enforce_almanac_import_immutability"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF ROW(OLD."id", OLD."userId", OLD."idempotencyKey", OLD."protocolVersion", OLD."scope", OLD."rawPacket", OLD."receipt", OLD."createdAt")
       IS DISTINCT FROM
       ROW(NEW."id", NEW."userId", NEW."idempotencyKey", NEW."protocolVersion", NEW."scope", NEW."rawPacket", NEW."receipt", NEW."createdAt") THEN
        RAISE EXCEPTION 'Almanac Import provenance is immutable' USING ERRCODE = '22000';
    END IF;
    IF OLD."undoneAt" IS NOT NULL AND NEW."undoneAt" IS DISTINCT FROM OLD."undoneAt" THEN
        RAISE EXCEPTION 'An undone Almanac Import cannot be reactivated or re-dated' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "AlmanacImport_immutable_provenance" BEFORE UPDATE ON "AlmanacImport"
FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_import_immutability"();

CREATE FUNCTION "reject_almanac_history_update"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'Almanac Places and Updates are append-only' USING ERRCODE = '22000';
END;
$$;

CREATE TRIGGER "AlmanacPlace_append_only" BEFORE UPDATE ON "AlmanacPlace"
FOR EACH ROW EXECUTE FUNCTION "reject_almanac_history_update"();
CREATE TRIGGER "AlmanacUpdate_append_only" BEFORE UPDATE ON "AlmanacUpdate"
FOR EACH ROW EXECUTE FUNCTION "reject_almanac_history_update"();

REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_import_immutability"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "reject_almanac_history_update"() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_import_immutability"(), "reject_almanac_history_update"() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_import_immutability"(), "reject_almanac_history_update"() FROM authenticated';
    END IF;
END
$$;
