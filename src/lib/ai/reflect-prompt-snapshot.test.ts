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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"4d2fb5e9dc39245fbe0836a48f4a460e5451c7d32baaf64a980b67a8c1d99693"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
    expect(prompt).toContain("ATTRIBUTES AT A DATE");
    expect(prompt).toContain("Move 5 — Plan frontier");
    expect(prompt).toContain("FROM YOUR MAP — map facts the oneLiner did not already state");
    expect(prompt).toContain("THEME READING FIELD LANES");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("does NOT apply to theme oneLiner or reflective");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).toContain("THEME OUTPUT (reflect path):");
    expect(prompt).toContain("ACROSS PURSUITS (combined)");
    expect(prompt).toContain("WORTH KNOWING (contextual)");
    expect(prompt).toContain("NOTABLE FACTS");
    expect(prompt).not.toContain("COMPARISON (contextual)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain('contextual and combined MUST be empty strings ""');
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"e42925383a1b34ac6d5959668c665d43de00f9f9c1b0b48c26d612c3e07b9641"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
    expect(prompt).toContain("ATTRIBUTES AT A DATE");
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
