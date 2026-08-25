import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260813090000_almanac_persisted_dogfood/migration.sql",
  ),
  "utf8",
);

describe("Almanac migration security contract", () => {
  it("creates exactly the three canonical Almanac tables", () => {
    const tables = [...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);
    expect(tables).toEqual(["AlmanacImport", "AlmanacPlace", "AlmanacUpdate"]);
  });

  it("keeps all three tables outside direct Supabase Data API access", () => {
    for (const table of ["AlmanacImport", "AlmanacPlace", "AlmanacUpdate"]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it("enforces owner-bound foreign keys and immutable provenance", () => {
    expect(migration).toContain('FOREIGN KEY ("importId", "userId")');
    expect(migration).toContain('FOREIGN KEY ("placeId", "userId")');
    expect(migration).toContain('FOREIGN KEY ("supersedesUpdateId", "userId")');
    expect(migration).toContain('CREATE TRIGGER "AlmanacImport_immutable_provenance"');
    expect(migration).toContain('CREATE TRIGGER "AlmanacPlace_append_only"');
    expect(migration).toContain('CREATE TRIGGER "AlmanacUpdate_append_only"');
  });

  it("does not write or alter a V1 domain table", () => {
    expect(migration).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE) "(?:Goal|ThemeCategory|Milestone|InsightCache|LifeObservation|AtlasPlacement)"/);
  });
});
