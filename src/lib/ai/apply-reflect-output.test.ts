import { describe, expect, it } from "vitest";

import { dedupeSuggestedMilestones } from "@/lib/ai/apply-reflect-output";

describe("apply-reflect-output", () => {
  it("milestone dedup guard strips duplicate titles", () => {
    const deduped = dedupeSuggestedMilestones([
      { title: "CeMAP Module 1" },
      { title: "cemap module 1" },
      { title: "CeMAP Module 2" },
    ]);

    expect(deduped).toEqual([{ title: "CeMAP Module 1" }, { title: "CeMAP Module 2" }]);
  });
});
