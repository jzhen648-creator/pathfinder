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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"2cff25b3e64715b92d017fdd4bf1bbed8e7ed554d25f59780a583941a328b348"`);
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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"fbf286974fa198dfd411be3630abb0b2ec1e4b0395a3d275296c981344e44ec0"`);
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
