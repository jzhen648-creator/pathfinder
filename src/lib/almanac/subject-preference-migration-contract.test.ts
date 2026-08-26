import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260826190000_almanac_subject_preferences/migration.sql",
  ),
  "utf8",
);

describe("Almanac Subject preference migration contract", () => {
  it("adds one mutable presentation table without altering canonical history", () => {
    expect([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]))
      .toEqual(["AlmanacSubjectPreference"]);
    expect(migration).not.toMatch(/ALTER TABLE "(?:AlmanacImport|AlmanacPlace|AlmanacUpdate)" (?:DROP|ALTER|RENAME)/);
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) "(?:AlmanacImport|AlmanacPlace|AlmanacUpdate)"/);
  });

  it("keeps ownership, merge targets and Data API access fail-closed", () => {
    expect(migration).toContain('FOREIGN KEY ("placeId", "userId")');
    expect(migration).toContain('FOREIGN KEY ("mergedIntoPlaceId", "userId")');
    expect(migration).toContain(
      'ON "AlmanacSubjectPreference"("mergedIntoPlaceId", "userId")',
    );
    expect(migration).toContain('ALTER TABLE "AlmanacSubjectPreference" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it("does not write or alter a V1 domain table", () => {
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) "(?:Goal|ThemeCategory|Milestone|InsightCache|LifeObservation|AtlasPlacement)"/);
  });
});
