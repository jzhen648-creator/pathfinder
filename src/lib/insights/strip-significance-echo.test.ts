import { describe, expect, it } from "vitest";
import { stripSignificanceEcho } from "./strip-significance-echo";

describe("stripSignificanceEcho", () => {
  it("removes numeric significance ratings from reading prose", () => {
    expect(stripSignificanceEcho("High priority at 3/3 significance for your map.")).toBe(
      "High priority for your map.",
    );
    expect(stripSignificanceEcho("Significance of 2/3 shapes how this sits against savings.")).toBe(
      "shapes how this sits against savings.",
    );
    expect(stripSignificanceEcho("Rated 3 out of 3 for urgency.")).toBe("for urgency.");
    expect(stripSignificanceEcho("Marked 2/3 in your priorities.")).toBe("in your priorities.");
  });

  it("still strips legacy 1-5 echoes", () => {
    expect(stripSignificanceEcho("High priority at 4/5 significance for your map.")).toBe(
      "High priority for your map.",
    );
    expect(stripSignificanceEcho("Rated 5 out of 5 for urgency.")).toBe("for urgency.");
  });

  it("leaves unrelated numbers alone", () => {
    expect(stripSignificanceEcho("Target £2,500 with 3 months left.")).toBe(
      "Target £2,500 with 3 months left.",
    );
  });
});
