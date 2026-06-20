import type { LifeAreaId } from "./types";
import { normalizeCategoryLabelKey } from "./taxonomy";

/**
 * Canonical Lucide kebab-case slugs for all system taxonomy categories.
 * Single source of truth — mobile pursuit icons import this module.
 */
export const CATEGORY_LUCIDE_ICON_SLUGS = [
  "wallet",
  "home",
  "briefcase",
  "piggy-bank",
  "shield-check",
  "credit-card",
  "building-2",
  "award",
  "graduation-cap",
  "rocket",
  "search",
  "compass",
  "eye",
  "palette",
  "book-open",
  "map-pin",
  "heart",
  "users",
  "dumbbell",
  "apple",
  "sparkles",
  "moon",
] as const;

export type CategoryLucideIconSlug = (typeof CATEGORY_LUCIDE_ICON_SLUGS)[number];

/** Per-theme category slot → Lucide slug (keys are `normalizeCategoryLabelKey(threadType)`). */
export const CATEGORY_LUCIDE_ICONS: Record<LifeAreaId, Record<string, CategoryLucideIconSlug>> = {
  finance: {
    "pay from work": "wallet",
    "property income": "home",
    "business & freelance": "briefcase",
    "assets & investing": "piggy-bank",
    "safety net & insurance": "shield-check",
    "debts & loans": "credit-card",
  },
  work: {
    "jobs & roles": "building-2",
    qualifications: "award",
    "education & courses": "graduation-cap",
    "projects & launches": "rocket",
    "career search": "search",
  },
  becoming: {
    "values & direction": "compass",
    "mind & wellbeing": "eye",
  },
  pleasures: {
    "hobbies & making": "palette",
    "books, film & culture": "book-open",
    "trips & events": "map-pin",
  },
  people: {
    family: "home",
    "partner & romance": "heart",
    "friends & community": "users",
  },
  health: {
    "training & sport": "dumbbell",
    "food & nutrition": "apple",
    "body care": "sparkles",
    "rest & recovery": "moon",
  },
};

/** Slot-order fallback — mirrors `LOCKED_CATEGORY_TEMPLATES` per theme. */
export const CATEGORY_LUCIDE_ICON_SLOT_ORDER: Record<LifeAreaId, readonly CategoryLucideIconSlug[]> = {
  finance: ["wallet", "home", "briefcase", "piggy-bank", "shield-check", "credit-card"],
  work: ["building-2", "award", "graduation-cap", "rocket", "search"],
  becoming: ["compass", "eye"],
  pleasures: ["palette", "book-open", "map-pin"],
  people: ["home", "heart", "users"],
  health: ["dumbbell", "apple", "sparkles", "moon"],
};

function normalizedSlotIndex(branchIndex: number, slotCount: number): number {
  const n = Math.floor(branchIndex);
  return ((n % slotCount) + slotCount) % slotCount;
}

/** Lucide slug for a system category label under a theme; `null` when unknown. */
export function categoryLucideIconSlug(
  themeId: LifeAreaId,
  categoryLabel: string | null | undefined,
  branchIndex?: number,
): CategoryLucideIconSlug | null {
  const trimmed = categoryLabel?.trim();
  if (!trimmed) return null;

  const byTheme = CATEGORY_LUCIDE_ICONS[themeId];
  const canonical = normalizeCategoryLabelKey(trimmed);
  if (byTheme[canonical]) return byTheme[canonical];

  const needle = trimmed.toLowerCase();
  const displayKey = Object.keys(byTheme).find(
    (key) => key.toLowerCase() === needle || normalizeCategoryLabelKey(key) === canonical,
  );
  if (displayKey) return byTheme[displayKey]!;

  if (branchIndex != null) {
    const slots = CATEGORY_LUCIDE_ICON_SLOT_ORDER[themeId];
    return slots[normalizedSlotIndex(branchIndex, slots.length)] ?? null;
  }

  return null;
}
