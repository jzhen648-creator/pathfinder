import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260906010000_almanac_persistent_suggestions/migration.sql",
  ),
  "utf8",
);

describe("persistent Suggestion migration contract", () => {
  it("separates source, decision and application history", () => {
    expect([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]))
      .toEqual([
        "AlmanacSuggestion",
        "AlmanacSuggestionDecision",
        "AlmanacSuggestionApplication",
      ]);
    expect(migration).toContain('CREATE TRIGGER "AlmanacSuggestion_immutable_source"');
    expect(migration).toContain('CREATE TRIGGER "AlmanacSuggestionDecision_append_only"');
    expect(migration).toContain('CREATE TRIGGER "AlmanacSuggestionApplication_immutable"');
  });

  it("enforces one active acceptance and exactly one accepted Update", () => {
    expect(migration).toContain('"AlmanacSuggestionApplication_one_active_key"');
    expect(migration).toContain('WHERE "revertedAt" IS NULL');
    expect(migration).toContain('"AlmanacUpdate_suggestionApplicationId_key"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "AlmanacSuggestionApplication_update_exists"');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('CREATE TRIGGER "AlmanacUpdate_suggestion_lineage"');
  });

  it("keeps lifecycle tables outside direct Data API access", () => {
    for (const table of [
      "AlmanacSuggestion",
      "AlmanacSuggestionDecision",
      "AlmanacSuggestionApplication",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).toContain("FROM service_role");
    expect(migration).not.toMatch(/CREATE POLICY/iu);
  });

  it("preserves legacy uniqueness while allowing re-acceptance history", () => {
    expect(migration).toContain('"AlmanacUpdate_legacy_import_line_key"');
    expect(migration).toContain('WHERE "suggestionApplicationId" IS NULL');
    expect(migration).toContain('"AlmanacSuggestionApplication_suggestionId_applicationSequence_key"');
  });
});
