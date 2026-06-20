import { describe, expect, it } from "vitest";

import { formatProfileFactsForContext } from "@/lib/ai/format-user-context";

describe("formatProfileFactsForContext", () => {
  it("groups facts by category with readable labels", () => {
    expect(
      formatProfileFactsForContext([
        { category: "relationships", key: "life_stage", value: "Early career" },
        { category: "career", key: "target_role", value: "Financial adviser" },
      ]),
    ).toEqual([
      "Career: target role — Financial adviser",
      "Relationships: life stage — Early career",
    ]);
  });

  it("caps facts per category and total", () => {
    const facts = Array.from({ length: 5 }, (_, index) => ({
      category: "personal" as const,
      key: `fact_${index}`,
      value: `Value ${index}`,
    }));

    const lines = formatProfileFactsForContext(facts);
    expect(lines).toHaveLength(3);
  });

  it("skips empty values", () => {
    expect(
      formatProfileFactsForContext([{ category: "health", key: "sleep", value: "   " }]),
    ).toEqual([]);
  });
});
