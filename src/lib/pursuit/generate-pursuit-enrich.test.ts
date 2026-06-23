import { describe, expect, it } from "vitest";

import { buildEnrichSystemPrompt } from "@/lib/pursuit/generate-pursuit-enrich";

const ENRICH_OPTIONS = {
  clarifyTitles: false,
} as const;

describe("buildEnrichSystemPrompt", () => {
  it("includes field lanes and cross-pursuit domain-context body rule", () => {
    const prompt = buildEnrichSystemPrompt(ENRICH_OPTIONS, false, false);

    expect(prompt).toContain("PURSUIT INSIGHT FIELD LANES");
    expect(prompt).toContain("PURSUIT body — optional cross-pursuit domain context (qualitative only)");
    expect(prompt).toContain("what this pursuit type is");
    expect(prompt).toContain("AT MOST ONE sentence");
    expect(prompt).not.toContain("weave one benchmark sentence into the body");
    expect(prompt).not.toContain("From your map:");
    expect(prompt).toContain(
      "Ground map-fact sentences in provided scoped context JSON; the optional cross-pursuit domain-context sentence is exempt",
    );
  });

  it("lists banned prescriptive patterns in the domain-context rule", () => {
    const prompt = buildEnrichSystemPrompt(ENRICH_OPTIONS, false, false);
    for (const phrase of ["you should", "consider", "I recommend", "try"]) {
      expect(prompt).toContain(phrase);
    }
    expect(prompt).toContain("no suggesting new pursuits");
  });
});
