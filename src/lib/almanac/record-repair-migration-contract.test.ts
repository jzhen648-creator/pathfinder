import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260902120000_almanac_record_repair_foundation/migration.sql",
  ),
  "utf8",
);

describe("Almanac record-repair migration contract", () => {
  it("adds a truthful DIRECT source protocol without weakening AI provenance", () => {
    expect(migration).toContain(
      'ALTER TYPE "AlmanacImportScope" ADD VALUE IF NOT EXISTS \'DIRECT\'',
    );
    expect(migration).toContain("\"protocolVersion\" = 'ALMANAC/1'");
    expect(migration).toContain("\"protocolVersion\" = 'ALMANAC/USER/1'");
    expect(migration).toContain("\"scope\"::text = 'DIRECT'");
  });

  it("creates owner-bound append-only multi-predecessor lineage and backfills it", () => {
    expect(migration).toContain('CREATE TABLE "AlmanacUpdateSupersession"');
    expect(migration).toContain(
      'FOREIGN KEY ("successorUpdateId", "userId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("predecessorUpdateId", "userId")',
    );
    expect(migration).toContain(
      'CHECK ("successorUpdateId" <> "predecessorUpdateId")',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "AlmanacUpdateSupersession_append_only"',
    );
    expect(migration).toMatch(
      /INSERT INTO "AlmanacUpdateSupersession"[\s\S]+"supersedesUpdateId" IS NOT NULL/,
    );
    expect(migration).toContain(
      'ALTER TABLE "AlmanacUpdateSupersession" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdateSupersession" FROM service_role',
    );
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it("preserves populated legacy cross-Place lineage before enforcing new-edge integrity", () => {
    const backfillPosition = migration.indexOf('INSERT INTO "AlmanacUpdateSupersession"');
    const integrityTriggerPosition = migration.indexOf(
      'CREATE TRIGGER "AlmanacUpdateSupersession_integrity"',
    );

    expect(backfillPosition).toBeGreaterThan(-1);
    expect(integrityTriggerPosition).toBeGreaterThan(-1);
    expect(backfillPosition).toBeLessThan(integrityTriggerPosition);
    expect(migration).toContain(
      "Older builds allowed a valid\n-- combine -> cross-Place supersede -> unmerge sequence",
    );
  });

  it("adds only two significance levels and canonical partial target dates", () => {
    expect(migration).toContain(
      'CREATE TYPE "AlmanacUpdateSignificance" AS ENUM (\'STANDARD\', \'KEY\')',
    );
    expect(migration).toContain(
      'CREATE TYPE "AlmanacTargetDatePrecision" AS ENUM (\'YEAR\', \'MONTH\', \'DAY\')',
    );
    expect(migration).toContain(
      '"significance" "AlmanacUpdateSignificance" NOT NULL DEFAULT \'STANDARD\'',
    );
    expect(migration).toContain('"targetDate" DATE');
    expect(migration).toContain(
      'CONSTRAINT "AlmanacUpdatePreference_target_date_pair"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "AlmanacUpdatePreference_next_target_date"',
    );
  });

  it("does not alter a legacy V1 product table or create generic notes", () => {
    expect(migration).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) "(?:Goal|ThemeCategory|Milestone|InsightCache|LifeObservation|AtlasPlacement)"/,
    );
    expect(migration).not.toMatch(/manual.?note|AlmanacNote/i);
  });
});
