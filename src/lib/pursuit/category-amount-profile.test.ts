import { describe, expect, it } from "vitest";

import {
  categoryAmountProfile,
  categoryMetricProfile,
  formatCurrencyAmount,
  formatDirectionAwareAmountFact,
  formatPursuitAmountLabel,
} from "@/lib/pursuit/category-amount-profile";

describe("categoryAmountProfile", () => {
  it("classifies finance income categories as flow", () => {
    expect(categoryAmountProfile("finance", "Pay from work")).toBe("flow");
    expect(categoryAmountProfile("finance", "salary")).toBe("flow");
  });
});

describe("categoryMetricProfile", () => {
  it("returns weight progress for health Body care", () => {
    expect(categoryMetricProfile("health", "Body care")).toEqual({
      shape: "progress",
      kind: "weight",
      defaultUnit: "kg",
    });
  });

  it("returns currency progress for finance safety net", () => {
    expect(categoryMetricProfile("finance", "Safety net & insurance")?.kind).toBe("currency");
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

  it("formats non-GBP currency from unit instead of hardcoding GBP", () => {
    const label = formatCurrencyAmount(1200, "USD");
    expect(label).toContain("1,200");
    expect(label).not.toContain("£");
  });
});

describe("formatDirectionAwareAmountFact", () => {
  it("labels debt, savings, income, and weight with direction", () => {
    expect(
      formatDirectionAwareAmountFact({
        themeId: "finance",
        categoryLabel: "Debts & loans",
        currentAmount: 4200,
        targetAmount: 10000,
        unit: "GBP",
      }),
    ).toBe("Debt remaining: 4200/10000 GBP");

    expect(
      formatDirectionAwareAmountFact({
        themeId: "finance",
        categoryLabel: "Assets & investing",
        currentAmount: 4200,
        targetAmount: 10000,
        unit: "GBP",
      }),
    ).toBe("Saved: 4200/10000 GBP");

    expect(
      formatDirectionAwareAmountFact({
        themeId: "finance",
        categoryLabel: "Pay from work",
        currentAmount: 50000,
        unit: "GBP/year",
      }),
    ).toBe("Income: 50000 GBP/year");

    expect(
      formatDirectionAwareAmountFact({
        themeId: "health",
        categoryLabel: "Body care",
        currentAmount: 68,
        targetAmount: 60,
        unit: "kg",
      }),
    ).toBe("Weight: 68/60 kg (reducing toward target)");
  });
});
