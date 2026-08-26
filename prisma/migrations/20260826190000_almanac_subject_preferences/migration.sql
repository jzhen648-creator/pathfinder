-- Mutable Subject presentation preferences. Canonical Almanac responses,
-- Places and Updates remain append-only and are never rewritten by these
-- controls.
CREATE TABLE "AlmanacSubjectPreference" (
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "iconKey" TEXT,
    "archivedAt" TIMESTAMP(3),
    "mergedIntoPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlmanacSubjectPreference_pkey" PRIMARY KEY ("placeId"),
    CONSTRAINT "AlmanacSubjectPreference_display_name_length" CHECK (
      "displayName" IS NULL OR char_length(btrim("displayName")) BETWEEN 1 AND 80
    ),
    CONSTRAINT "AlmanacSubjectPreference_icon_key" CHECK (
      "iconKey" IS NULL OR "iconKey" IN (
        'activity', 'book-open', 'briefcase-business', 'circle',
        'compass', 'house', 'landmark', 'wallet'
      )
    ),
    CONSTRAINT "AlmanacSubjectPreference_no_self_merge" CHECK (
      "mergedIntoPlaceId" IS NULL OR "mergedIntoPlaceId" <> "placeId"
    )
);

CREATE UNIQUE INDEX "AlmanacSubjectPreference_placeId_userId_key"
  ON "AlmanacSubjectPreference"("placeId", "userId");
CREATE INDEX "AlmanacSubjectPreference_userId_archivedAt_idx"
  ON "AlmanacSubjectPreference"("userId", "archivedAt");
CREATE INDEX "AlmanacSubjectPreference_mergedIntoPlaceId_userId_idx"
  ON "AlmanacSubjectPreference"("mergedIntoPlaceId", "userId");

ALTER TABLE "AlmanacSubjectPreference"
  ADD CONSTRAINT "AlmanacSubjectPreference_placeId_userId_fkey"
  FOREIGN KEY ("placeId", "userId")
  REFERENCES "AlmanacPlace"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlmanacSubjectPreference"
  ADD CONSTRAINT "AlmanacSubjectPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AlmanacSubjectPreference"
  ADD CONSTRAINT "AlmanacSubjectPreference_mergedIntoPlaceId_userId_fkey"
  FOREIGN KEY ("mergedIntoPlaceId", "userId")
  REFERENCES "AlmanacPlace"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "AlmanacSubjectPreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacSubjectPreference" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacSubjectPreference" FROM anon;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacSubjectPreference" FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE "AlmanacSubjectPreference" FROM service_role;
