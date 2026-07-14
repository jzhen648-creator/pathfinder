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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"77cfa463d93e4ad6faf2bb629f0d29df10e6300c177915c3bd58f3dd2250efec"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
    expect(prompt).toContain("ATTRIBUTES AT A DATE");
    expect(prompt).toContain("AGE CHRONOLOGY VOICING");
    expect(prompt).toContain("CHAPTER HEADLINE JOB");
    expect(prompt).toContain("CONCRETE NOUNS");
    expect(prompt).toContain("Move 5 — Plan frontier");
    expect(prompt).toContain("FROM YOUR MAP — map facts the oneLiner did not already state");
    expect(prompt).toContain("THEME READING FIELD LANES");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("does NOT apply to theme oneLiner or reflective");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).toContain("THEME OUTPUT (reflect path):");
    expect(prompt).toContain("OVERALL OUTPUT (full reflect path only");
    expect(prompt).toContain('{ tone, oneLiner, support }');
    expect(prompt).not.toContain("ACROSS PURSUITS (combined)");
    expect(prompt).toContain("WORTH KNOWING (contextual)");
    expect(prompt).toContain("NOTABLE FACTS");
    expect(prompt).not.toContain("COMPARISON (contextual)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain('contextual and combined MUST be empty strings ""');
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"d7179f0bdb0ef5f0150a7faa2ac8f2fdc51f0ade30d5350233d2f830c8f85db9"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).not.toContain("OVERALL OUTPUT");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
    expect(prompt).toContain("ATTRIBUTES AT A DATE");
    expect(prompt).toContain("AGE CHRONOLOGY VOICING");
    expect(prompt).toContain("CHAPTER HEADLINE JOB");
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
