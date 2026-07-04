import { describe, expect, it } from "vitest";

import { mergePreservedClarifiers } from "@/lib/pursuit/pursuit-cache-patch";
import type { Clarifier } from "@/lib/pursuit/pursuit-enrich-types";

const fresh: Clarifier[] = [
  { id: "next-q", prompt: "Full-time or part-time?", options: ["Full-time", "Part-time"], kind: "clarify" as const },
  { id: "extra", prompt: "Extra?", options: ["A", "B"], kind: "clarify" as const },
];

describe("mergePreservedClarifiers", () => {
  it("next mode returns only fresh clarifiers capped at one", () => {
    const merged = mergePreservedClarifiers({
      fresh,
      cached: [{ id: "old", prompt: "Old?", options: ["A", "B"], kind: "clarify" as const }],
      preserveAllowed: true,
      mode: "next",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("next-q");
  });

  it("initial mode preserves cached pending when present", () => {
    const cached: Clarifier[] = [{ id: "pending", prompt: "Pending?", options: ["A", "B"], kind: "clarify" }];
    const merged = mergePreservedClarifiers({
      fresh,
      cached,
      preserveAllowed: true,
      mode: "initial",
    });
    expect(merged).toEqual(cached);
  });
});
