import { describe, expect, it } from "vitest";

import {
  categoryAmountProfile,
  formatPursuitAmountLabel,
} from "@/lib/pursuit/category-amount-profile";

describe("categoryAmountProfile", () => {
  it("classifies finance income categories as flow", () => {
    expect(categoryAmountProfile("finance", "Pay from work")).toBe("flow");
    expect(categoryAmountProfile("finance", "salary")).toBe("flow");
  });
});

describe("formatPursuitAmountLabel", () => {
  it("includes gross basis in flow labels", () => {
    expect(
      formatPursuitAmountLabel({
        profile: "flow",
        currentAmount: 50000,
        unit: "GBP/year",
        amountBasis: "gross",
      }),
    ).toBe("£50,000 gross/year");
  });
});
