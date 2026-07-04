import { describe, expect, it } from "vitest";
import { stripSignificanceEcho } from "./strip-significance-echo";

describe("stripSignificanceEcho", () => {
  it("removes numeric significance ratings from reading prose", () => {
    expect(stripSignificanceEcho("High priority at 4/5 significance for your map.")).toBe(
      "High priority for your map.",
    );
    expect(stripSignificanceEcho("Significance of 3/5 shapes how this sits against savings.")).toBe(
      "shapes how this sits against savings.",
    );
    expect(stripSignificanceEcho("Rated 5 out of 5 for urgency.")).toBe("for urgency.");
    expect(stripSignificanceEcho("Marked 3/5 in your priorities.")).toBe("in your priorities.");
  });

  it("leaves unrelated numbers alone", () => {
    expect(stripSignificanceEcho("Target £2,500 with 3 months left.")).toBe(
      "Target £2,500 with 3 months left.",
    );
  });
});
