import { describe, expect, it } from "vitest";

import {
  filterClarifiersAgainstKnownFacts,
  textRestatesKnownFact,
} from "@/lib/pursuit/filter-clarifiers-against-known-facts";
import type { Clarifier, EnrichAnswer } from "@/lib/pursuit/pursuit-enrich-types";

const isaClarifier: Clarifier = {
  id: "annual-contribution",
  prompt: "What's your current annual contribution to this ISA?",
  options: ["£20,000", "Under £10k", "£10k–£15k", "Not contributing yet"],
};

describe("filterClarifiersAgainstKnownFacts", () => {
  it("drops clarifier when background line overlaps prompt and options", () => {
    const filtered = filterClarifiersAgainstKnownFacts([isaClarifier], {
      background: "£20,000 contribution each tax year",
      enrichAnswers: [],
    });
    expect(filtered).toEqual([]);
  });

  it("drops clarifier when enrichAnswer selectedOption overlaps", () => {
    const enrichAnswers: EnrichAnswer[] = [
      {
        clarifierId: "prev-qq",
        prompt: "How are you funding this?",
        selectedOption: "£20,000 annual ISA contribution",
      },
    ];
    const filtered = filterClarifiersAgainstKnownFacts([isaClarifier], {
      background: null,
      enrichAnswers,
    });
    expect(filtered).toEqual([]);
  });

  it("keeps unrelated clarifier when no overlap with known facts", () => {
    const visaClarifier: Clarifier = {
      id: "visa-route",
      prompt: "Which visa route are you targeting?",
      options: ["Skilled Worker", "Global Talent", "Student", "Other"],
    };
    const filtered = filterClarifiersAgainstKnownFacts([visaClarifier], {
      background: "£20,000 contribution each tax year",
      enrichAnswers: [],
    });
    expect(filtered).toEqual([visaClarifier]);
  });

  it("is a no-op when background and enrichAnswers are empty", () => {
    const filtered = filterClarifiersAgainstKnownFacts([isaClarifier], {
      background: null,
      enrichAnswers: [],
    });
    expect(filtered).toEqual([isaClarifier]);
  });

  it("matches each background line independently", () => {
    const filtered = filterClarifiersAgainstKnownFacts([isaClarifier], {
      background: "Started in 2024\n£20,000 contribution each tax year",
      enrichAnswers: [],
    });
    expect(filtered).toEqual([]);
  });
});

describe("textRestatesKnownFact", () => {
  it("returns true when two or more fact tokens appear in candidate text", () => {
    expect(
      textRestatesKnownFact(
        "What's your current annual contribution? £20,000",
        "£20,000 contribution each tax year",
      ),
    ).toBe(true);
  });

  it("returns false when overlap is below threshold", () => {
    expect(
      textRestatesKnownFact(
        "Which broker are you using?",
        "£20,000 contribution each tax year",
      ),
    ).toBe(false);
  });
});
