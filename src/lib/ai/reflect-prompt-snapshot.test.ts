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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"c3470e53418d6db243a956a1d9f6d0827dc8530f9202f47b35f4bd3290852249"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("FROM YOUR MAP — endogenous map facts only");
    expect(prompt).toContain('{ tone, oneLiner, reflective }');
    expect(prompt).not.toContain("combined (UI: ACROSS PURSUITS");
    expect(prompt).not.toContain("contextual (UI: COMPARISON");
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"7e444385ad0106720346787559d0a2a61398bfc6e2a0b330d8210bc80694d574"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
  });
});
