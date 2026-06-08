import type { LifeAreaId } from "./types";
import { normalizeHubLabelKey } from "./taxonomy";

/**
 * Canonical Lucide kebab-case slugs for all 20 system hubs.
 * Single source of truth — mobile pursuit icons import this module.
 */
export const HUB_LUCIDE_ICON_SLUGS = [
  "wallet",
  "piggy-bank",
  "shield-check",
  "credit-card",
  "briefcase",
  "graduation-cap",
  "rocket",
  "compass",
  "eye",
  "sun",
  "palette",
  "book-open",
  "map-pin",
  "home",
  "heart",
  "users",
  "dumbbell",
  "apple",
  "sparkles",
  "moon",
] as const;

export type HubLucideIconSlug = (typeof HUB_LUCIDE_ICON_SLUGS)[number];

/** Per-theme hub slot → Lucide slug (keys are `normalizeHubLabelKey(threadType)`). */
export const HUB_LUCIDE_ICONS: Record<LifeAreaId, Record<string, HubLucideIconSlug>> = {
  finance: {
    income: "wallet",
    assets: "piggy-bank",
    "safety net": "shield-check",
    liabilities: "credit-card",
  },
  work: {
    career: "briefcase",
    skills: "graduation-cap",
    "builds & launches": "rocket",
  },
  becoming: {
    "purpose & values": "compass",
    "mind & emotions": "eye",
    "joy & creativity": "sun",
  },
  pleasures: {
    hobbies: "palette",
    culture: "book-open",
    experiences: "map-pin",
  },
  people: {
    family: "home",
    romance: "heart",
    friendships: "users",
  },
  health: {
    movement: "dumbbell",
    nutrition: "apple",
    appearance: "sparkles",
    rest: "moon",
  },
};

/** Slot-order fallback — mirrors `LOCKED_HUB_TEMPLATES` per theme. */
export const HUB_LUCIDE_ICON_SLOT_ORDER: Record<LifeAreaId, readonly HubLucideIconSlug[]> = {
  finance: ["wallet", "piggy-bank", "shield-check", "credit-card"],
  work: ["briefcase", "graduation-cap", "rocket"],
  becoming: ["compass", "eye", "sun"],
  pleasures: ["palette", "book-open", "map-pin"],
  people: ["home", "heart", "users"],
  health: ["dumbbell", "apple", "sparkles", "moon"],
};

function normalizedSlotIndex(branchIndex: number, slotCount: number): number {
  const n = Math.floor(branchIndex);
  return ((n % slotCount) + slotCount) % slotCount;
}

/** Lucide slug for a system hub label under a theme; `null` when unknown. */
export function hubLucideIconSlug(
  themeId: LifeAreaId,
  hubLabel: string | null | undefined,
  branchIndex?: number,
): HubLucideIconSlug | null {
  const trimmed = hubLabel?.trim();
  if (!trimmed) return null;

  const byTheme = HUB_LUCIDE_ICONS[themeId];
  const canonical = normalizeHubLabelKey(trimmed);
  if (byTheme[canonical]) return byTheme[canonical];

  const needle = trimmed.toLowerCase();
  const displayKey = Object.keys(byTheme).find(
    (key) => key.toLowerCase() === needle || normalizeHubLabelKey(key) === canonical,
  );
  if (displayKey) return byTheme[displayKey]!;

  if (branchIndex != null) {
    const slots = HUB_LUCIDE_ICON_SLOT_ORDER[themeId];
    return slots[normalizedSlotIndex(branchIndex, slots.length)] ?? null;
  }

  return null;
}
