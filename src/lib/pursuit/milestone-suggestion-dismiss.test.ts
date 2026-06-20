import { describe, expect, it } from "vitest";

import { filterSuggestedMilestoneByTitle } from "@/lib/pursuit/apply-clarifier-answers";

describe("filterSuggestedMilestoneByTitle", () => {
  const items = [
    { title: "Save deposit", order: 0 },
    { title: "Book test drive", order: 1 },
  ];

  it("removes a matching title case-insensitively", () => {
    expect(filterSuggestedMilestoneByTitle(items, "book test drive")).toEqual([
      { title: "Save deposit", order: 0 },
    ]);
  });

  it("returns all items when title is blank", () => {
    expect(filterSuggestedMilestoneByTitle(items, "   ")).toEqual(items);
  });
});
