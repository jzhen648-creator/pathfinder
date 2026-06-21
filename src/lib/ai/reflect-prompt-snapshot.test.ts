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
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"899f52bb1662410388d9b66dddae0036f3768c15626e60fb874ace3e21c3b4b3"`);
    expect(prompt).toContain("TENSION, NOT FORECAST:");
    expect(prompt).toContain("ACROSS PURSUITS");
    expect(prompt).toContain("COMPARISON");
    expect(prompt).not.toContain("cite at least one in reflective or combined");
  });

  it("pursuits-only prompt fingerprint is stable", () => {
    const prompt = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(promptFingerprint(prompt)).toMatchInlineSnapshot(`"3f924f720ba546d0a3c569cdf4cbb774b7ee7fb5c2ebd2da7176ced3128bb26b"`);
    expect(prompt).not.toContain("THEME INSIGHTS");
    expect(prompt).toContain("TENSION, NOT FORECAST:");
  });
});
