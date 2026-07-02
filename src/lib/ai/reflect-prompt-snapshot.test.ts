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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"6cd1cd513cc1cea76666700e9ae4fee94cf989dde702c385201733a6c5a320a5"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
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
    expect(prompt).toContain("COMPARISON (contextual)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain('contextual and combined MUST be empty strings ""');
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"3b3a98464d3ef339146c4fbe1ea2594ba75a8acb7d090d7fad49568f1dd3b7f8"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("PLAN IMPLICATION");
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
