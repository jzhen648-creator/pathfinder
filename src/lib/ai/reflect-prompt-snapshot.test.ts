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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"b1eb03eb50a1bbfb390fb10ad2218530d456d7bcc393cc60e769d5ff4acec026"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("FROM YOUR MAP — within-theme relationships");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).toContain("THEME OUTPUT (reflect path — map-only)");
    expect(prompt).not.toContain("fromMap");
    expect(prompt).not.toContain("combined (UI: ACROSS PURSUITS");
    expect(prompt).not.toContain("contextual (UI: COMPARISON");
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"3ba1d8bc20519e4b223a413f0ce0ddec0fc9b9e4705f4deaf80f5d5752463028"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("CHAPTER READING FIELD LANES");
    expect(prompt).toContain("Worth knowing ·");
    expect(prompt).not.toContain("fromMap");
  });
});
