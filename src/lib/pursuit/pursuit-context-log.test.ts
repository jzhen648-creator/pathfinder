import { describe, expect, it } from "vitest";

import {
  clarifierAnswerLine,
  derivePursuitDescriptionFromLog,
} from "@/lib/pursuit/pursuit-context-log";

describe("derivePursuitDescriptionFromLog", () => {
  it("uses latest authored entry plus clarifier lines", () => {
    const description = derivePursuitDescriptionFromLog([
      { kind: "create", text: "First context line." },
      { kind: "manual_edit", text: "Replaced context." },
      { kind: "clarifier_answer", text: "What kind? → Tech" },
    ]);
    expect(description).toBe("Replaced context.\nWhat kind? → Tech");
  });

  it("dedupes identical lines", () => {
    const description = derivePursuitDescriptionFromLog([
      { kind: "clarifier_answer", text: "Same → Yes" },
      { kind: "clarifier_answer", text: "Same → Yes" },
    ]);
    expect(description).toBe("Same → Yes");
  });
});

describe("clarifierAnswerLine", () => {
  it("matches legacy append format", () => {
    expect(clarifierAnswerLine("What does this refer to?", "Mortgage broker")).toBe(
      "What does this refer to? → Mortgage broker",
    );
  });
});
