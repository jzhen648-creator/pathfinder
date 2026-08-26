-- Subject History no longer uses spatial Atlas positions. Keep the deployed
-- compatibility column and owner-scoped uniqueness, but remove the abandoned
-- 64-position product capacity.
ALTER TABLE "AlmanacPlace"
  DROP CONSTRAINT IF EXISTS "AlmanacPlace_slot_range";

-- The API's versioned Subject-icon registry is authoritative validation.
-- Removing the enumerated database CHECK lets the presentation vocabulary grow
-- without rewriting a large schema constraint for each icon release.
ALTER TABLE "AlmanacSubjectPreference"
  DROP CONSTRAINT IF EXISTS "AlmanacSubjectPreference_icon_key";
