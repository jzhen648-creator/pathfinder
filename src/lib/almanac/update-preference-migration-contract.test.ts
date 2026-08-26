import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260827090000_almanac_update_preferences/migration.sql"),
  "utf8",
);

describe("Almanac Update preference migration contract", () => {
  it("adds only an owner-scoped mutable visibility boundary", () => {
    expect(migration).toContain('CREATE TABLE "AlmanacUpdatePreference"');
    expect(migration).toContain('REFERENCES "AlmanacUpdate"("id", "userId")');
    expect(migration).toContain('ALTER TABLE "AlmanacUpdatePreference" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE "AlmanacUpdatePreference" FROM authenticated');
    expect(migration).not.toContain('ALTER TABLE "AlmanacUpdate"');
    expect(migration).not.toContain('ALTER TABLE "AlmanacImport"');
  });
});
