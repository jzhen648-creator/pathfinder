import { describe, expect, it } from "vitest";

import {
  mergePreservedClarifiers,
  appendSkippedClarifierPrompt,
} from "@/lib/pursuit/pursuit-cache-patch";
import type { Clarifier } from "@/lib/pursuit/pursuit-enrich-types";

const c = (id: string, prompt: string): Clarifier => ({
  id,
  prompt,
  options: ["A", "B"],
  kind: "clarify",
});

describe("mergePreservedClarifiers", () => {
  it("routine mode keeps cached pending when fresh batch arrives", () => {
    const cached = [c("keep", "Keep me?")];
    const fresh = [c("new", "New question?")];
    expect(
      mergePreservedClarifiers({
        fresh,
        cached,
        preserveAllowed: true,
        mode: "routine",
      }),
    ).toEqual(cached);
  });

  it("routine mode accepts fresh when cache is empty", () => {
    const fresh = [c("a", "Q1?"), c("b", "Q2?")];
    expect(
      mergePreservedClarifiers({
        fresh,
        cached: [],
        preserveAllowed: true,
        mode: "routine",
      }),
    ).toHaveLength(2);
  });

  it("replenish adds up to three new cards after dismiss", () => {
    const fresh = [c("n1", "N1?"), c("n2", "N2?"), c("n3", "N3?"), c("n4", "N4?")];
    const merged = mergePreservedClarifiers({
      fresh,
      cached: [],
      preserveAllowed: true,
      mode: "replenish",
    });
    expect(merged).toHaveLength(3);
  });

  it("filters fresh prompts that match skipped wording", () => {
    const merged = mergePreservedClarifiers({
      fresh: [c("n1", "Same prompt?"), c("n2", "Different?")],
      cached: [],
      preserveAllowed: true,
      mode: "replenish",
      skippedPrompts: ["Same prompt?"],
    });
    expect(merged.map((x) => x.id)).toEqual(["n2"]);
  });
});

describe("appendSkippedClarifierPrompt", () => {
  it("records skipped prompt wording", () => {
    const list = appendSkippedClarifierPrompt(undefined, "One?");
    expect(list).toEqual(["One?"]);
  });
});
