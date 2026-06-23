import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildReflectPursuitsOnlySystemPrompt,
  buildReflectSystemPrompt,
} from "@/lib/ai/generate-reflect";

const ENRICH_OPTIONS = {
  clarifyTitles: false,
} as const;

function promptFingerprint(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

describe("reflect prompt snapshots", () => {
  it("full-scope prompt fingerprint is stable", () => {
    const prompt = buildReflectSystemPrompt(ENRICH_OPTIONS, "full", false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"8a23dc6c6bd12c38c2adf60ee5f5036e14d1915ed2c72e8ae5866eb8e177b0c9"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("FROM YOUR MAP — endogenous map facts only");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).toContain("PURSUIT INSIGHT FIELD LANES");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).toContain("THEME OUTPUT (reflect path — map-only)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain("combined (UI: ACROSS PURSUITS");
    expect(prompt).not.toContain("contextual (UI: COMPARISON");
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"c155545e7b5c01aa75c3641425e6c569cbf6400cb34d627a56f0dd5f04dbc264"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PURSUIT INSIGHT FIELD LANES");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
