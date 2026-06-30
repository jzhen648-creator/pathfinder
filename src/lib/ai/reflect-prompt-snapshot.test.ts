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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"a62f5346dd7a66f866e7016e2485b0431c10e8e3b68731a70321d8dc4d5f5b60"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("FROM YOUR MAP — within-theme relationships");
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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"fca092370a4f1c808af99d155dc49766fe4e074ea7e122f38f5cd65f9c95e84d"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PURSUIT INSIGHT FIELD LANES");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
