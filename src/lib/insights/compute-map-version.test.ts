import { describe, expect, it } from "vitest";

import { profileFactsMemoryOffset } from "@/lib/insights/compute-map-version";

describe("profileFactsMemoryOffset", () => {
  it("returns zero when there are no profile facts", () => {
    expect(profileFactsMemoryOffset(0, null)).toBe(0);
  });

  it("changes when profile facts are updated", () => {
    const earlier = profileFactsMemoryOffset(2, new Date("2026-01-01T00:00:00.000Z"));
    const later = profileFactsMemoryOffset(2, new Date("2026-06-01T00:00:00.000Z"));
    expect(earlier).not.toBe(later);
  });
});
