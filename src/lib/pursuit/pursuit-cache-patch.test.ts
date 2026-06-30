import { describe, expect, it } from "vitest";
import {
  buildPursuitCachePayload,
  resolveReflectSuggestedContinuations,
} from "@/lib/pursuit/pursuit-cache-patch";

describe("resolveReflectSuggestedContinuations", () => {
  it("returns empty for non-complete pursuits", () => {
    expect(
      resolveReflectSuggestedContinuations({
        fresh: [{ title: "Next thing", rationale: "Because." }],
        goalStatus: "ACTIVE",
        allMapTitles: [],
      }),
    ).toEqual([]);
  });

  it("strips suggestions that already exist on the map", () => {
    expect(
      resolveReflectSuggestedContinuations({
        fresh: [
          { title: "CeMAP practice", rationale: "Follow-on." },
          { title: "New advisory firm", rationale: "Different." },
        ],
        goalStatus: "COMPLETE",
        allMapTitles: ["CeMAP Practice"],
      }),
    ).toEqual([{ title: "New advisory firm", rationale: "Different." }]);
  });
});

describe("buildPursuitCachePayload", () => {
  it("includes suggestedContinuations as cache-worthy content", () => {
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

    expect(payload?.suggestedContinuations).toEqual([
      { title: "Advisory practice", rationale: "Natural next." },
    ]);
  });
});
