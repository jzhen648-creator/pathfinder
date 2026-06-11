import type { LifeAreaId } from "./types";
import { normalizeHubLabelKey } from "./taxonomy";

/**
 * Canonical Lucide kebab-case slugs for all system hub categories.
 * Single source of truth — mobile pursuit icons import this module.
 */
export const HUB_LUCIDE_ICON_SLUGS = [
  "wallet",
  "home",
  "briefcase",
  "piggy-bank",
  "shield-check",
  "credit-card",
  "building-2",
  "graduation-cap",
  "rocket",
  "compass",
  "eye",
  "sun",
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

export type HubLucideIconSlug = (typeof HUB_LUCIDE_ICON_SLUGS)[number];

/** Per-theme hub slot → Lucide slug (keys are `normalizeHubLabelKey(threadType)`). */
export const HUB_LUCIDE_ICONS: Record<LifeAreaId, Record<string, HubLucideIconSlug>> = {
  finance: {
    "employment income": "wallet",
    "rental & property income": "home",
    "business & freelance income": "briefcase",
    "assets & investing": "piggy-bank",
    "safety net": "shield-check",
    "debts & obligations": "credit-card",
  },
  work: {
    job: "building-2",
    "skills & learning": "graduation-cap",
    "projects & shipping": "rocket",
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
    "body & grooming": "sparkles",
    "rest & sleep": "moon",
  },
};

/** Slot-order fallback — mirrors `LOCKED_HUB_TEMPLATES` per theme. */
export const HUB_LUCIDE_ICON_SLOT_ORDER: Record<LifeAreaId, readonly HubLucideIconSlug[]> = {
  finance: ["wallet", "home", "briefcase", "piggy-bank", "shield-check", "credit-card"],
  work: ["building-2", "graduation-cap", "rocket"],
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
