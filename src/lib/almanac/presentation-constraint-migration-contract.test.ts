import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260826220000_almanac_remove_presentation_caps/migration.sql",
  ),
  "utf8",
);

describe("Almanac presentation constraint migration", () => {
  it("removes the Atlas capacity and enumerated icon checks without rewriting history", () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "AlmanacPlace_slot_range"');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "AlmanacSubjectPreference_icon_key"');
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)/u);
    expect(migration).not.toMatch(/ALTER TABLE "(?:AlmanacImport|AlmanacUpdate)"/u);
  });

  it("does not touch a legacy product table", () => {
    expect(migration).not.toMatch(/"(?:Goal|ThemeCategory|Milestone|InsightCache|LifeObservation|AtlasPlacement)"/u);
  });
});
