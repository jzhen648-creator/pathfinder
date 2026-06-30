import { describe, expect, it } from "vitest";
import {
  buildPursuitCachePayload,
  resolveReflectSuggestedMilestones,
} from "@/lib/pursuit/pursuit-cache-patch";

describe("resolveReflectSuggestedMilestones", () => {
  it("returns null when milestones are not allowed", () => {
    expect(
      resolveReflectSuggestedMilestones({
        fresh: [{ title: "Step one", order: 0 }],
        cached: undefined,
        mapMilestones: [],
        allowed: false,
      }),
    ).toBeNull();
  });
});

describe("buildPursuitCachePayload", () => {
  it("does not write suggestedContinuations to cache", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [],
      insight: {
        tone: "arrival",
        headline: "Done",
        body: "Finished the qualification.",
      },
      suggestedMilestones: null,
      suggestedContinuations: [{ title: "Advisory practice", rationale: "Natural next." }],
    });

    expect(payload?.suggestedContinuations).toBeUndefined();
    expect(payload?.headline).toBe("Done");
  });
});
