import { describe, expect, it } from "vitest";
import { normalizeSuggestedContinuations } from "@/lib/pursuit/normalize-pursuit-enrich";

describe("normalizeSuggestedContinuations", () => {
  it("coerces missing to empty array", () => {
    expect(normalizeSuggestedContinuations(undefined)).toEqual([]);
    expect(normalizeSuggestedContinuations(null)).toEqual([]);
  });

  it("drops empty titles and caps at 2", () => {
    const out = normalizeSuggestedContinuations([
      { title: "  Mortgage advisory practice  ", rationale: "Natural next step." },
      { title: "", rationale: "skip" },
      { title: "Third pursuit", rationale: "too many" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe("Mortgage advisory practice");
  });

  it("truncates title and rationale", () => {
    const out = normalizeSuggestedContinuations([
      {
        title: "x".repeat(100),
        rationale: "y".repeat(250),
      },
    ]);
    expect(out[0]?.title.length).toBeLessThanOrEqual(80);
    expect(out[0]?.rationale.length).toBeLessThanOrEqual(200);
  });
});
