import { describe, expect, it } from "vitest";
import {
  formatProfileFactsForContext,
  isOrientationProfileFact,
  orientationValueFromProfileFacts,
  profileFactsExcludingOrientation,
} from "@/lib/ai/format-user-context";

describe("orientation profile fact helpers", () => {
  const orientationFact = {
    category: "preferences" as const,
    key: "orientation",
    value: "Optimise everything, Stay independent",
  };

  it("detects orientation facts", () => {
    expect(isOrientationProfileFact(orientationFact)).toBe(true);
    expect(
      isOrientationProfileFact({ category: "preferences", key: "theme", value: "x" }),
    ).toBe(false);
  });

  it("extracts orientation value", () => {
    expect(orientationValueFromProfileFacts([orientationFact])).toBe(
      "Optimise everything, Stay independent",
    );
    expect(orientationValueFromProfileFacts([])).toBeNull();
  });

  it("excludes orientation from generic profile fact formatting", () => {
    const facts = [
      orientationFact,
      { category: "relationships" as const, key: "life_stage", value: "Married" },
    ];
    const genericFacts = profileFactsExcludingOrientation(facts);
    const lines = formatProfileFactsForContext(genericFacts);

    expect(genericFacts).toHaveLength(1);
    expect(lines).toEqual(["Relationships: life stage — Married"]);
    expect(lines.some((line) => line.includes("orientation"))).toBe(false);
  });
});
