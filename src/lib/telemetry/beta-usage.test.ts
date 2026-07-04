import { describe, expect, it } from "vitest";
import { normalizeBetaUsageEvent } from "./beta-usage";

describe("normalizeBetaUsageEvent", () => {
  it("accepts valid names and trims props", () => {
    const result = normalizeBetaUsageEvent({
      name: " tab.map ",
      props: {
        tab: "map",
        note: "x".repeat(600),
        nested: { no: "pe" },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("tab.map");
    expect(result.data.props?.tab).toBe("map");
    expect(String(result.data.props?.note).length).toBeLessThanOrEqual(500);
    expect(result.data.props?.nested).toBeUndefined();
  });

  it("rejects empty or invalid names", () => {
    expect(normalizeBetaUsageEvent({ name: "" }).ok).toBe(false);
    expect(normalizeBetaUsageEvent({ name: "a".repeat(65) }).ok).toBe(false);
    expect(normalizeBetaUsageEvent({ name: "bad name" }).ok).toBe(false);
  });
});
