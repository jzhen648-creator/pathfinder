CREATE TYPE "AlmanacSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');
CREATE TYPE "AlmanacSuggestionDecisionKind" AS ENUM ('EDIT', 'DISMISS', 'RESTORE', 'ACCEPT', 'UNDO_ACCEPTANCE');

CREATE TABLE "AlmanacSuggestion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "sourceLineNumber" INTEGER NOT NULL,
  "originalSubjectName" TEXT NOT NULL,
  "originalState" "AlmanacUpdateState" NOT NULL,
  "originalText" TEXT NOT NULL,
  "draftSubjectName" TEXT NOT NULL,
  "draftState" "AlmanacUpdateState" NOT NULL,
  "draftText" TEXT NOT NULL,
  "routedPlaceId" TEXT,
  "supersedesUpdateId" TEXT,
  "status" "AlmanacSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlmanacSuggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlmanacSuggestion_source_line" CHECK ("sourceLineNumber" >= 3),
  CONSTRAINT "AlmanacSuggestion_version" CHECK ("version" >= 1),
  CONSTRAINT "AlmanacSuggestion_subject_lengths" CHECK (char_length("originalSubjectName") BETWEEN 1 AND 80 AND char_length("draftSubjectName") BETWEEN 1 AND 80),
  CONSTRAINT "AlmanacSuggestion_text_lengths" CHECK (char_length("originalText") BETWEEN 1 AND 500 AND char_length("draftText") BETWEEN 1 AND 500)
);

CREATE TABLE "AlmanacSuggestionDecision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "suggestionId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "kind" "AlmanacSuggestionDecisionKind" NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "resultVersion" INTEGER NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlmanacSuggestionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlmanacSuggestionDecision_operation_key_length" CHECK (char_length("operationKey") BETWEEN 8 AND 128),
  CONSTRAINT "AlmanacSuggestionDecision_hash_length" CHECK (char_length("requestHash") = 64),
  CONSTRAINT "AlmanacSuggestionDecision_versions" CHECK ("expectedVersion" >= 1 AND "resultVersion" >= 1),
  CONSTRAINT "AlmanacSuggestionDecision_result_object" CHECK (jsonb_typeof("result") = 'object')
);

CREATE TABLE "AlmanacSuggestionApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "suggestionId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "applicationSequence" INTEGER NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertedAt" TIMESTAMP(3),
  CONSTRAINT "AlmanacSuggestionApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AlmanacSuggestionApplication_sequence" CHECK ("applicationSequence" >= 1)
);

ALTER TABLE "AlmanacUpdate" ADD COLUMN "suggestionApplicationId" TEXT;

CREATE UNIQUE INDEX "AlmanacSuggestion_importId_sourceLineNumber_key" ON "AlmanacSuggestion"("importId", "sourceLineNumber");
CREATE UNIQUE INDEX "AlmanacSuggestion_id_userId_key" ON "AlmanacSuggestion"("id", "userId");
CREATE INDEX "AlmanacSuggestion_userId_status_updatedAt_idx" ON "AlmanacSuggestion"("userId", "status", "updatedAt");
CREATE INDEX "AlmanacSuggestion_routedPlaceId_userId_idx" ON "AlmanacSuggestion"("routedPlaceId", "userId");
CREATE UNIQUE INDEX "AlmanacSuggestionDecision_userId_operationKey_key" ON "AlmanacSuggestionDecision"("userId", "operationKey");
CREATE UNIQUE INDEX "AlmanacSuggestionDecision_id_userId_key" ON "AlmanacSuggestionDecision"("id", "userId");
CREATE INDEX "AlmanacSuggestionDecision_suggestionId_createdAt_idx" ON "AlmanacSuggestionDecision"("suggestionId", "createdAt");
CREATE UNIQUE INDEX "AlmanacSuggestionApplication_decisionId_key" ON "AlmanacSuggestionApplication"("decisionId");
CREATE UNIQUE INDEX "AlmanacSuggestionApplication_decisionId_userId_key" ON "AlmanacSuggestionApplication"("decisionId", "userId");
CREATE UNIQUE INDEX "AlmanacSuggestionApplication_suggestionId_applicationSequence_key" ON "AlmanacSuggestionApplication"("suggestionId", "applicationSequence");
CREATE UNIQUE INDEX "AlmanacSuggestionApplication_id_userId_key" ON "AlmanacSuggestionApplication"("id", "userId");
CREATE UNIQUE INDEX "AlmanacSuggestionApplication_one_active_key" ON "AlmanacSuggestionApplication"("suggestionId") WHERE "revertedAt" IS NULL;
CREATE INDEX "AlmanacSuggestionApplication_userId_revertedAt_idx" ON "AlmanacSuggestionApplication"("userId", "revertedAt");
CREATE UNIQUE INDEX "AlmanacUpdate_suggestionApplicationId_key" ON "AlmanacUpdate"("suggestionApplicationId");
CREATE UNIQUE INDEX "AlmanacUpdate_suggestionApplicationId_userId_key" ON "AlmanacUpdate"("suggestionApplicationId", "userId");
CREATE UNIQUE INDEX "AlmanacUpdate_legacy_import_line_key" ON "AlmanacUpdate"("importId", "sourceLineNumber") WHERE "suggestionApplicationId" IS NULL;
DROP INDEX "AlmanacUpdate_importId_sourceLineNumber_key";

ALTER TABLE "AlmanacSuggestion" ADD CONSTRAINT "AlmanacSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestion" ADD CONSTRAINT "AlmanacSuggestion_importId_userId_fkey" FOREIGN KEY ("importId", "userId") REFERENCES "AlmanacImport"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestion" ADD CONSTRAINT "AlmanacSuggestion_routedPlaceId_userId_fkey" FOREIGN KEY ("routedPlaceId", "userId") REFERENCES "AlmanacPlace"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestion" ADD CONSTRAINT "AlmanacSuggestion_supersedesUpdateId_userId_fkey" FOREIGN KEY ("supersedesUpdateId", "userId") REFERENCES "AlmanacUpdate"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestionDecision" ADD CONSTRAINT "AlmanacSuggestionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestionDecision" ADD CONSTRAINT "AlmanacSuggestionDecision_suggestionId_userId_fkey" FOREIGN KEY ("suggestionId", "userId") REFERENCES "AlmanacSuggestion"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestionApplication" ADD CONSTRAINT "AlmanacSuggestionApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestionApplication" ADD CONSTRAINT "AlmanacSuggestionApplication_suggestionId_userId_fkey" FOREIGN KEY ("suggestionId", "userId") REFERENCES "AlmanacSuggestion"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacSuggestionApplication" ADD CONSTRAINT "AlmanacSuggestionApplication_decisionId_userId_fkey" FOREIGN KEY ("decisionId", "userId") REFERENCES "AlmanacSuggestionDecision"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlmanacUpdate" ADD CONSTRAINT "AlmanacUpdate_suggestionApplicationId_userId_fkey" FOREIGN KEY ("suggestionApplicationId", "userId") REFERENCES "AlmanacSuggestionApplication"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "enforce_almanac_suggestion_originals"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (
    to_jsonb(OLD) - ARRAY[
      'draftSubjectName', 'draftState', 'draftText', 'routedPlaceId',
      'supersedesUpdateId', 'status', 'version', 'updatedAt'
    ]::text[]
  ) IS DISTINCT FROM (
    to_jsonb(NEW) - ARRAY[
      'draftSubjectName', 'draftState', 'draftText', 'routedPlaceId',
      'supersedesUpdateId', 'status', 'version', 'updatedAt'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'Almanac Suggestion source identity is immutable' USING ERRCODE = '22000';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Almanac Suggestion version must advance exactly once' USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AlmanacSuggestion_immutable_source" BEFORE UPDATE ON "AlmanacSuggestion" FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_suggestion_originals"();
CREATE TRIGGER "AlmanacSuggestionDecision_append_only" BEFORE UPDATE ON "AlmanacSuggestionDecision" FOR EACH ROW EXECUTE FUNCTION "reject_almanac_history_update"();

CREATE FUNCTION "enforce_almanac_suggestion_application_update"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(OLD."id", OLD."userId", OLD."suggestionId", OLD."decisionId", OLD."applicationSequence", OLD."acceptedAt") IS DISTINCT FROM ROW(NEW."id", NEW."userId", NEW."suggestionId", NEW."decisionId", NEW."applicationSequence", NEW."acceptedAt") OR OLD."revertedAt" IS NOT NULL OR NEW."revertedAt" IS NULL THEN
    RAISE EXCEPTION 'Almanac Suggestion Application is immutable except for one Undo' USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AlmanacSuggestionApplication_immutable" BEFORE UPDATE ON "AlmanacSuggestionApplication" FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_suggestion_application_update"();

CREATE FUNCTION "enforce_almanac_suggestion_application_integrity"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE decision_suggestion text; decision_user text;
BEGIN
  SELECT decision."suggestionId", decision."userId" INTO decision_suggestion, decision_user
  FROM public."AlmanacSuggestionDecision" decision
  WHERE decision."id" = NEW."decisionId";
  IF decision_suggestion IS DISTINCT FROM NEW."suggestionId" OR decision_user IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Almanac Suggestion Application must match its acceptance decision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AlmanacSuggestionApplication_integrity" BEFORE INSERT ON "AlmanacSuggestionApplication" FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_suggestion_application_integrity"();

CREATE FUNCTION "enforce_almanac_suggestion_application_update_exists"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."AlmanacUpdate" update_row
    WHERE update_row."suggestionApplicationId" = NEW."id" AND update_row."userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'Almanac Suggestion Application must produce exactly one Update' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "AlmanacSuggestionApplication_update_exists"
AFTER INSERT ON "AlmanacSuggestionApplication" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_suggestion_application_update_exists"();

CREATE FUNCTION "enforce_almanac_suggestion_update_lineage"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE source_import text; source_line integer; source_user text;
BEGIN
  IF NEW."suggestionApplicationId" IS NULL THEN RETURN NEW; END IF;
  SELECT suggestion."importId", suggestion."sourceLineNumber", suggestion."userId" INTO source_import, source_line, source_user
  FROM public."AlmanacSuggestionApplication" application
  JOIN public."AlmanacSuggestion" suggestion ON suggestion."id" = application."suggestionId" AND suggestion."userId" = application."userId"
  WHERE application."id" = NEW."suggestionApplicationId";
  IF source_import IS DISTINCT FROM NEW."importId" OR source_line IS DISTINCT FROM NEW."sourceLineNumber" OR source_user IS DISTINCT FROM NEW."userId" THEN
    RAISE EXCEPTION 'Accepted Update must retain its Suggestion source lineage' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AlmanacUpdate_suggestion_lineage" BEFORE INSERT ON "AlmanacUpdate" FOR EACH ROW EXECUTE FUNCTION "enforce_almanac_suggestion_update_lineage"();

ALTER TABLE "AlmanacSuggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlmanacSuggestionDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlmanacSuggestionApplication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacSuggestion", "AlmanacSuggestionDecision", "AlmanacSuggestionApplication" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_suggestion_originals"(), "enforce_almanac_suggestion_application_update"(), "enforce_almanac_suggestion_application_integrity"(), "enforce_almanac_suggestion_application_update_exists"(), "enforce_almanac_suggestion_update_lineage"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacSuggestion", "AlmanacSuggestionDecision", "AlmanacSuggestionApplication" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_suggestion_originals"(), "enforce_almanac_suggestion_application_update"(), "enforce_almanac_suggestion_application_integrity"(), "enforce_almanac_suggestion_application_update_exists"(), "enforce_almanac_suggestion_update_lineage"() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacSuggestion", "AlmanacSuggestionDecision", "AlmanacSuggestionApplication" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_suggestion_originals"(), "enforce_almanac_suggestion_application_update"(), "enforce_almanac_suggestion_application_integrity"(), "enforce_almanac_suggestion_application_update_exists"(), "enforce_almanac_suggestion_update_lineage"() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AlmanacSuggestion", "AlmanacSuggestionDecision", "AlmanacSuggestionApplication" FROM service_role';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION "enforce_almanac_suggestion_originals"(), "enforce_almanac_suggestion_application_update"(), "enforce_almanac_suggestion_application_integrity"(), "enforce_almanac_suggestion_application_update_exists"(), "enforce_almanac_suggestion_update_lineage"() FROM service_role';
  END IF;
END
$$;
