import { describe, expect, it } from "vitest";

import { validateReadingOutput } from "@/lib/story/validate-reading-output";

describe("validateReadingOutput", () => {
  it("passes sparse reading with verbatim titles", () => {
    const result = validateReadingOutput(
      "Product Lead search is active with a September deadline. What would move it forward this week?",
      {
        pursuitTitles: ["Product Lead search"],
        depthMode: "sparse",
      },
    );
    expect(result.ok).toBe(true);
    expect(result.wordCount).toBeLessThanOrEqual(60);
  });

  it("flags banned phrases", () => {
    const result = validateReadingOutput(
      "Your journey with Product Lead search is just beginning.",
      {
        pursuitTitles: ["Product Lead search"],
        depthMode: "sparse",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "banned_phrase")).toBe(true);
  });

  it("flags missing verbatim title in sparse mode", () => {
    const result = validateReadingOutput(
      "A significant job search is active with momentum building.",
      {
        pursuitTitles: ["Product Lead search"],
        depthMode: "sparse",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing_title")).toBe(true);
  });

  it("enforces panoramic word band", () => {
    const short = validateReadingOutput("Too short.", {
      pursuitTitles: ["A", "B", "C"],
      depthMode: "panoramic",
    });
    expect(short.ok).toBe(false);
    expect(short.issues.some((i) => i.code === "word_count")).toBe(true);

    const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const longTitle = "Senior Engineer at Acme";
    const panoramic = validateReadingOutput(
      `${longTitle} and Product Lead search shape the map near £500,000 ISA. ${words}`,
      {
        pursuitTitles: [longTitle, "Product Lead search", "£500,000 ISA"],
        depthMode: "panoramic",
      },
    );
    expect(panoramic.ok).toBe(true);
  });
});
