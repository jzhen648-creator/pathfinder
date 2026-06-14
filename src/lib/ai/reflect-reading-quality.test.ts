import { describe, expect, it } from "vitest";

import { validateReadingOutput } from "@/lib/story/validate-reading-output";

describe("reflect reading quality (rubric gates)", () => {
  it("passes sparse CeMAP reading with no arrival language when starved", () => {
    const result = validateReadingOutput(
      "CeMAP qualification is active with a June deadline. What is the smallest next step on Unit 1?",
      {
        pursuitTitles: ["CeMAP qualification"],
        depthMode: "sparse",
        noArrivalLanguage: true,
      },
    );
    expect(result.ok).toBe(true);
  });

  it("flags backward arc language on sparse map when arrival was starved", () => {
    const result = validateReadingOutput(
      "Looking back, CeMAP qualification shows momentum built over the past few months.",
      {
        pursuitTitles: ["CeMAP qualification"],
        depthMode: "sparse",
        noArrivalLanguage: true,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "arrival_language")).toBe(true);
  });

  it("requires gap pursuit to be named when deadline is near", () => {
    const result = validateReadingOutput(
      "CeMAP qualification has a June deadline and no milestone movement yet. What is the next step on Unit 1?",
      {
        pursuitTitles: ["CeMAP qualification"],
        depthMode: "sparse",
        requiredGapTitles: ["CeMAP qualification"],
      },
    );
    expect(result.ok).toBe(true);
  });

  it("flags when high-significance deadline pursuit is not named (gap)", () => {
    const result = validateReadingOutput(
      "A significant qualification is active with a near deadline but no movement.",
      {
        pursuitTitles: ["CeMAP qualification"],
        depthMode: "sparse",
        requiredGapTitles: ["CeMAP qualification"],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "gap_not_named")).toBe(true);
  });
});
