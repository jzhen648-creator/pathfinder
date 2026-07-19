import { describe, expect, it } from "vitest";
import {
  CHAPTER_TYPE_HUB_LABEL,
  deriveCategoryFiling,
  financeHubUnlocksAmount,
  matchNameFilingHint,
  resolveHubLabelForChapterTypeInTheme,
  suggestChapterTypeFromTitle,
} from "./category-derivation";
import { LIFE_AREA_IDS, categoriesForTheme, normalizeCategoryLabelKey } from "./taxonomy";

describe("category-derivation", () => {
  it("maps every non-custom chapter type to a known locked hub label", () => {
    for (const [typeId, hubLabel] of Object.entries(CHAPTER_TYPE_HUB_LABEL)) {
      if (typeId === "custom") continue;
      const key = normalizeCategoryLabelKey(hubLabel);
      const found = LIFE_AREA_IDS.some((themeId) =>
        categoriesForTheme(themeId).some(
          (t) => normalizeCategoryLabelKey(t.threadType) === key,
        ),
      );
      expect(found, `${typeId} → ${hubLabel}`).toBe(true);
    }
  });

  it("files financial_account under Assets & investing in finance", () => {
    const filing = deriveCategoryFiling({
      themeId: "finance",
      title: "Vanguard",
      chapterType: "financial_account",
    });
    expect(filing.source).toBe("chapterType");
    expect(filing.hubLabel).toBe("Assets & investing");
    expect(financeHubUnlocksAmount(filing.hubLabel)).toBe(true);
  });

  it("files emergency fund by name into Safety net & insurance", () => {
    const filing = deriveCategoryFiling({
      themeId: "finance",
      title: "Emergency fund",
      chapterType: "custom",
    });
    expect(filing.source).toBe("nameHint");
    expect(filing.hubLabel).toBe("Safety net & insurance");
    expect(financeHubUnlocksAmount(filing.hubLabel)).toBe(true);
  });

  it("suggests financial_account for ISA titles", () => {
    expect(suggestChapterTypeFromTitle("Stocks & Shares ISA", "finance")).toBe(
      "financial_account",
    );
    const filing = deriveCategoryFiling({
      themeId: "finance",
      title: "Stocks & Shares ISA",
      chapterType: null,
    });
    expect(filing.hubLabel).toBe("Assets & investing");
    expect(financeHubUnlocksAmount(filing.hubLabel)).toBe(true);
  });

  it("falls back to theme default when no type or hint matches", () => {
    const filing = deriveCategoryFiling({
      themeId: "becoming",
      title: "Something unique",
      chapterType: "custom",
    });
    expect(filing.source).toBe("themeDefault");
    expect(filing.hubLabel).toBe("Values & direction");
  });

  it("falls back when chapter type hub is not in the current theme", () => {
    // employment_role prefers Jobs & roles (work) — not present under finance
    expect(resolveHubLabelForChapterTypeInTheme("finance", "employment_role")).toBeNull();
    const filing = deriveCategoryFiling({
      themeId: "finance",
      title: "Day job",
      chapterType: "employment_role",
    });
    // No finance name hint for "Day job" → theme default Pay from work
    expect(filing.source).toBe("themeDefault");
    expect(filing.hubLabel).toBe("Pay from work");
    expect(financeHubUnlocksAmount(filing.hubLabel)).toBe(true);
  });

  it("ignores name hints for the wrong theme", () => {
    expect(matchNameFilingHint("Emergency fund", "work")).toBeNull();
  });

  it("every finance name-hint hub unlocks amount Evidence", () => {
    const financeHints = [
      "Emergency fund",
      "Rainy day fund",
      "House deposit",
      "Credit card",
      "ISA",
      "SIPP",
      "Pension",
      "Salary",
      "Rental income",
      "Freelance work",
      "Mortgage",
    ];
    for (const title of financeHints) {
      const filing = deriveCategoryFiling({
        themeId: "finance",
        title,
        chapterType: "custom",
      });
      expect(
        financeHubUnlocksAmount(filing.hubLabel),
        `${title} → ${filing.hubLabel}`,
      ).toBe(true);
    }
  });

  it("files training practice under Training & sport", () => {
    const filing = deriveCategoryFiling({
      themeId: "health",
      title: "Muay Thai",
      chapterType: "training_practice",
    });
    expect(filing.hubLabel).toBe("Training & sport");
  });

  it("files relocation under Family when type is set", () => {
    const filing = deriveCategoryFiling({
      themeId: "people",
      title: "Bangkok",
      chapterType: "relocation",
    });
    expect(filing.source).toBe("chapterType");
    expect(filing.hubLabel).toBe("Family");
  });
});
