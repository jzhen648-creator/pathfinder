import type { ChapterTypeId } from "@/lib/chapter-types";
import {
  categoriesForTheme,
  normalizeCategoryLabelKey,
} from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";

/**
 * Server-owned category filing for name-first chapter creation.
 * Category remains an internal ThemeCategory row id; users never pick it.
 */

/** Canonical hub labels used when chapterType is set (must exist in LOCKED_CATEGORY_TEMPLATES). */
export const CHAPTER_TYPE_HUB_LABEL: Record<ChapterTypeId, string> = {
  employment_role: "Jobs & roles",
  education_qualification: "Qualifications",
  business: "Projects & launches",
  financial_account: "Assets & investing",
  property_home: "Property income",
  relocation: "Family",
  relationship: "Family",
  health_condition: "Body care",
  training_practice: "Training & sport",
  creative_channel: "Hobbies & making",
  custom: "Values & direction",
};

/** Finance labels that unlock amount / Evidence UI (mobile + API amount profiles). */
export const FINANCE_AMOUNT_UNLOCK_LABEL_KEYS = new Set([
  "pay from work",
  "property income",
  "business & freelance",
  "assets & investing",
  "safety net & insurance",
  "debts & loans",
]);

export type NameFilingHint = {
  /** Substring match against normalized title (lowercase). Ignored when `regex` is set. */
  pattern?: string;
  /** Regex source matched against normalized title (case-insensitive). */
  regex?: string;
  /** Preferred theme when the hint should apply. Null = any theme that has the hub. */
  themeId: LifeAreaId | null;
  hubLabel: string;
  /** Suggested chapter type for the mobile name-first chip. */
  suggestedChapterType: ChapterTypeId;
};

/**
 * Deterministic keyword → hub / type suggestions.
 * First match wins; keep more specific phrases before shorter ones.
 */
export const NAME_FILING_HINTS: readonly NameFilingHint[] = [
  // ── Finance: safety net (before generic "saving") ──
  {
    pattern: "emergency fund",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "emergency savings",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "emergency",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "rainy day",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "safety net",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "life insurance",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "income protection",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  {
    pattern: "insurance",
    themeId: "finance",
    hubLabel: "Safety net & insurance",
    suggestedChapterType: "custom",
  },
  // ── Finance: assets / savings ──
  {
    pattern: "house deposit",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "custom",
  },
  {
    pattern: "deposit",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "custom",
  },
  {
    pattern: "save up",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "custom",
  },
  {
    pattern: "savings",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "custom",
  },
  {
    pattern: "saving",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "custom",
  },
  {
    pattern: "investing",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  {
    pattern: "invest",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  // ── Finance: debts ──
  {
    pattern: "credit card",
    themeId: "finance",
    hubLabel: "Debts & loans",
    suggestedChapterType: "custom",
  },
  {
    pattern: "student loan",
    themeId: "finance",
    hubLabel: "Debts & loans",
    suggestedChapterType: "custom",
  },
  {
    pattern: "mortgage",
    themeId: "finance",
    hubLabel: "Debts & loans",
    suggestedChapterType: "custom",
  },
  {
    pattern: "debt",
    themeId: "finance",
    hubLabel: "Debts & loans",
    suggestedChapterType: "custom",
  },
  {
    pattern: "loan",
    themeId: "finance",
    hubLabel: "Debts & loans",
    suggestedChapterType: "custom",
  },
  // ── Finance: accounts / income ──
  {
    pattern: "sipp",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  {
    pattern: "isa",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  {
    pattern: "pension",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  {
    pattern: "stocks and shares",
    themeId: "finance",
    hubLabel: "Assets & investing",
    suggestedChapterType: "financial_account",
  },
  {
    pattern: "salary",
    themeId: "finance",
    hubLabel: "Pay from work",
    suggestedChapterType: "custom",
  },
  {
    pattern: "paycheck",
    themeId: "finance",
    hubLabel: "Pay from work",
    suggestedChapterType: "custom",
  },
  {
    pattern: "wage",
    themeId: "finance",
    hubLabel: "Pay from work",
    suggestedChapterType: "custom",
  },
  {
    pattern: "rental",
    themeId: "finance",
    hubLabel: "Property income",
    suggestedChapterType: "property_home",
  },
  {
    pattern: "buy to let",
    themeId: "finance",
    hubLabel: "Property income",
    suggestedChapterType: "property_home",
  },
  {
    pattern: "buy-to-let",
    themeId: "finance",
    hubLabel: "Property income",
    suggestedChapterType: "property_home",
  },
  {
    pattern: "freelance",
    themeId: "finance",
    hubLabel: "Business & freelance",
    suggestedChapterType: "business",
  },
  // ── Health: body care / weight (before training) ──
  {
    pattern: "lose weight",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    pattern: "weight loss",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    pattern: "weight",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    pattern: "diet",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    pattern: "cutting",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    pattern: "bulking",
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  {
    regex: String.raw`\b\d+(\.\d+)?\s*(kg|kgs|lb|lbs)\b`,
    themeId: "health",
    hubLabel: "Body care",
    suggestedChapterType: "health_condition",
  },
  // ── Health: training ──
  {
    pattern: "muay thai",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "gym",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "running",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "swim",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "cycling",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "climbing",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "boxing",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "marathon",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "5k",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  {
    pattern: "10k",
    themeId: "health",
    hubLabel: "Training & sport",
    suggestedChapterType: "training_practice",
  },
  // ── Work ──
  {
    pattern: "promotion",
    themeId: "work",
    hubLabel: "Jobs & roles",
    suggestedChapterType: "employment_role",
  },
  {
    pattern: "pay rise",
    themeId: "work",
    hubLabel: "Jobs & roles",
    suggestedChapterType: "employment_role",
  },
  {
    pattern: "certification",
    themeId: "work",
    hubLabel: "Qualifications",
    suggestedChapterType: "education_qualification",
  },
  {
    pattern: "degree",
    themeId: "work",
    hubLabel: "Qualifications",
    suggestedChapterType: "education_qualification",
  },
  {
    pattern: "course",
    themeId: "work",
    hubLabel: "Qualifications",
    suggestedChapterType: "education_qualification",
  },
  // ── Cross-theme ──
  {
    pattern: "youtube",
    themeId: null,
    hubLabel: "Hobbies & making",
    suggestedChapterType: "creative_channel",
  },
  {
    pattern: "relocation",
    themeId: null,
    hubLabel: "Family",
    suggestedChapterType: "relocation",
  },
  {
    pattern: "move to",
    themeId: null,
    hubLabel: "Family",
    suggestedChapterType: "relocation",
  },
];

export type DerivedCategoryFiling = {
  hubLabel: string;
  hubSlug: string;
  source: "chapterType" | "nameHint" | "themeDefault";
  suggestedChapterType: ChapterTypeId | null;
};

/** First locked category template for a theme (stable theme default). */
export function defaultHubLabelForTheme(themeId: LifeAreaId): string {
  const rows = categoriesForTheme(themeId);
  return rows[0]?.threadType ?? "Values & direction";
}

export function isThemeDefaultHubLabel(
  themeId: LifeAreaId,
  hubLabel: string | null | undefined,
): boolean {
  if (!hubLabel?.trim()) return false;
  return (
    normalizeCategoryLabelKey(hubLabel) ===
    normalizeCategoryLabelKey(defaultHubLabelForTheme(themeId))
  );
}

export function hubLabelForChapterType(
  chapterType: ChapterTypeId | null | undefined,
): string | null {
  if (!chapterType || chapterType === "custom") return null;
  return CHAPTER_TYPE_HUB_LABEL[chapterType] ?? null;
}

/**
 * Resolve hub label for a chapter type within a theme.
 * If the type's preferred hub is not in this theme, fall back to theme default.
 */
export function resolveHubLabelForChapterTypeInTheme(
  themeId: LifeAreaId,
  chapterType: ChapterTypeId | null | undefined,
): string | null {
  const preferred = hubLabelForChapterType(chapterType);
  if (!preferred) return null;
  const key = normalizeCategoryLabelKey(preferred);
  const match = categoriesForTheme(themeId).find(
    (t) => normalizeCategoryLabelKey(t.threadType) === key,
  );
  return match ? match.threadType : null;
}

function hintMatchesTitle(normalizedTitle: string, hint: NameFilingHint): boolean {
  if (hint.regex) {
    try {
      return new RegExp(hint.regex, "i").test(normalizedTitle);
    } catch {
      return false;
    }
  }
  if (hint.pattern) return normalizedTitle.includes(hint.pattern);
  return false;
}

function hubExistsInTheme(themeId: LifeAreaId, hubLabel: string): boolean {
  const key = normalizeCategoryLabelKey(hubLabel);
  return categoriesForTheme(themeId).some(
    (t) => normalizeCategoryLabelKey(t.threadType) === key,
  );
}

export function matchNameFilingHint(
  title: string,
  themeId: LifeAreaId,
): NameFilingHint | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  for (const hint of NAME_FILING_HINTS) {
    if (!hintMatchesTitle(normalized, hint)) continue;
    if (hint.themeId != null && hint.themeId !== themeId) continue;
    if (!hubExistsInTheme(themeId, hint.hubLabel)) continue;
    return hint;
  }
  return null;
}

/**
 * Pure filing decision — does not touch the DB.
 * Priority: chapterType (non-custom) → name keyword → theme default.
 */
export function deriveCategoryFiling(input: {
  themeId: LifeAreaId;
  title?: string | null;
  chapterType?: ChapterTypeId | null;
}): DerivedCategoryFiling {
  const { themeId, title, chapterType } = input;

  const fromType = resolveHubLabelForChapterTypeInTheme(themeId, chapterType);
  if (fromType) {
    return {
      hubLabel: fromType,
      hubSlug: normalizeCategoryLabelKey(fromType),
      source: "chapterType",
      suggestedChapterType: chapterType ?? null,
    };
  }

  const hint = matchNameFilingHint(title ?? "", themeId);
  if (hint) {
    return {
      hubLabel: hint.hubLabel,
      hubSlug: normalizeCategoryLabelKey(hint.hubLabel),
      source: "nameHint",
      suggestedChapterType: hint.suggestedChapterType,
    };
  }

  const hubLabel = defaultHubLabelForTheme(themeId);
  return {
    hubLabel,
    hubSlug: normalizeCategoryLabelKey(hubLabel),
    source: "themeDefault",
    suggestedChapterType: chapterType === "custom" ? "custom" : null,
  };
}

/**
 * Title rename may re-file only when the chapter currently sits on the theme-default hub.
 * Never moves chapters already on a hint- or type-filed hub.
 */
export function resolveTitleRenameRefile(input: {
  themeId: LifeAreaId;
  currentHubLabel: string;
  newTitle: string;
  chapterType?: ChapterTypeId | null;
}): { shouldRefile: boolean; filing: DerivedCategoryFiling } {
  const filing = deriveCategoryFiling({
    themeId: input.themeId,
    title: input.newTitle,
    chapterType: input.chapterType,
  });

  if (!isThemeDefaultHubLabel(input.themeId, input.currentHubLabel)) {
    return { shouldRefile: false, filing };
  }

  if (filing.source === "themeDefault") {
    return { shouldRefile: false, filing };
  }

  if (
    normalizeCategoryLabelKey(filing.hubLabel) ===
    normalizeCategoryLabelKey(input.currentHubLabel)
  ) {
    return { shouldRefile: false, filing };
  }

  return { shouldRefile: true, filing };
}

/** True when a finance hub label unlocks amount / Evidence UI. */
export function financeHubUnlocksAmount(hubLabel: string): boolean {
  return FINANCE_AMOUNT_UNLOCK_LABEL_KEYS.has(normalizeCategoryLabelKey(hubLabel));
}

/** Suggest a chapter type from the title alone (mobile name-first chip). */
export function suggestChapterTypeFromTitle(
  title: string,
  themeId: LifeAreaId,
): ChapterTypeId | null {
  const hint = matchNameFilingHint(title, themeId);
  return hint?.suggestedChapterType ?? null;
}
