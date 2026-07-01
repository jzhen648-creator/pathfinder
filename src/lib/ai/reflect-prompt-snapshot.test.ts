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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"3d5dca57bfa8aeb2888d9c314167900fbfcae0f23e999d6aa628fb8b50102fb3"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("FROM YOUR MAP — within-theme relationships");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("does NOT apply to theme oneLiner or reflective");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).toContain("THEME OUTPUT (reflect path — map-only)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain("combined (UI: ACROSS PURSUITS");
    expect(prompt).not.toContain("contextual (UI: COMPARISON");
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"e4ada1ffa664b3c5de2ee86ccf8cf9526384254c182c34ade3589923f2a2941f"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("CHAPTER READING AUTHORSHIP");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
