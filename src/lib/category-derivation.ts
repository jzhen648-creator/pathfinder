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
  /** Substring match against normalized title (lowercase). */
  pattern: string;
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
  {
    pattern: "emergency fund",
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

export function matchNameFilingHint(
  title: string,
  themeId: LifeAreaId,
): NameFilingHint | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  for (const hint of NAME_FILING_HINTS) {
    if (!normalized.includes(hint.pattern)) continue;
    if (hint.themeId != null && hint.themeId !== themeId) continue;
    const key = normalizeCategoryLabelKey(hint.hubLabel);
    const inTheme = categoriesForTheme(themeId).some(
      (t) => normalizeCategoryLabelKey(t.threadType) === key,
    );
    if (!inTheme) continue;
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
