import { describe, expect, it } from "vitest";

import {
  clarifierAnswerLine,
  derivePursuitDescriptionFromLog,
  stripMirroredClarifierLinesFromDescription,
} from "@/lib/pursuit/pursuit-context-log";

describe("derivePursuitDescriptionFromLog", () => {
  it("uses latest authored entry and ignores clarifier_answer rows", () => {
    const description = derivePursuitDescriptionFromLog([
      { kind: "create", text: "First context line." },
      { kind: "manual_edit", text: "Replaced context." },
      { kind: "clarifier_answer", text: "What kind? → Tech" },
    ]);
    expect(description).toBe("Replaced context.");
  });

  it("returns empty when latest authored entry is a clear (empty manual_edit)", () => {
    const description = derivePursuitDescriptionFromLog([
      { kind: "create", text: "Notes from create." },
      { kind: "manual_edit", text: "" },
      { kind: "clarifier_answer", text: "ISA type? → Stocks and shares" },
    ]);
    expect(description).toBe("");
  });

  it("ignores clarifier_answer rows entirely", () => {
    const description = derivePursuitDescriptionFromLog([
      { kind: "clarifier_answer", text: "Same → Yes" },
      { kind: "clarifier_answer", text: "Same → Yes" },
    ]);
    expect(description).toBe("");
  });
});

describe("clarifierAnswerLine", () => {
  it("matches legacy append format", () => {
    expect(clarifierAnswerLine("What does this refer to?", "Mortgage broker")).toBe(
      "What does this refer to? → Mortgage broker",
    );
  });
});

describe("stripMirroredClarifierLinesFromDescription", () => {
  it("removes QQ mirror lines that match enrichAnswers", () => {
    const prompt = "Stocks or cash ISA?";
    const answer = "Stocks and shares";
    const stripped = stripMirroredClarifierLinesFromDescription(
      `Manual note.\n${clarifierAnswerLine(prompt, answer)}`,
      [{ prompt, selectedOption: answer }],
    );
    expect(stripped).toBe("Manual note.");
  });
});
