import type { LifeAreaId } from "./types";

/** Bump when locked theme/hub names change (sync + docs). */
export const TAXONOMY_VERSION = "2026-06-08-v8-play-leisure" as const;

export const LIFE_AREA_IDS = [
  "becoming",
  "pleasures",
  "finance",
  "health",
  "work",
  "people",
] as const satisfies readonly LifeAreaId[];

export type HubTemplate = {
  limbId: LifeAreaId;
  threadType: string;
  name: string;
};

/** Locked default root hubs — count varies by theme (20 total). */
export const LOCKED_HUB_TEMPLATES: readonly HubTemplate[] = [
  { limbId: "finance", threadType: "Income", name: "Income" },
  { limbId: "finance", threadType: "Assets", name: "Assets" },
  { limbId: "finance", threadType: "Safety net", name: "Safety net" },
  { limbId: "finance", threadType: "Liabilities", name: "Liabilities" },
  { limbId: "work", threadType: "Career", name: "Career" },
  { limbId: "work", threadType: "Skills", name: "Skills" },
  { limbId: "work", threadType: "Builds & Launches", name: "Builds & Launches" },
  { limbId: "becoming", threadType: "Purpose & Values", name: "Purpose & Values" },
  { limbId: "becoming", threadType: "Mind & Emotions", name: "Mind & Emotions" },
  { limbId: "becoming", threadType: "Joy & Creativity", name: "Joy & Creativity" },
  { limbId: "pleasures", threadType: "Hobbies", name: "Hobbies" },
  { limbId: "pleasures", threadType: "Culture", name: "Culture" },
  { limbId: "pleasures", threadType: "Experiences", name: "Experiences" },
  { limbId: "people", threadType: "Family", name: "Family" },
  { limbId: "people", threadType: "Romance", name: "Romance" },
  { limbId: "people", threadType: "Friendships", name: "Friendships" },
  { limbId: "health", threadType: "Movement", name: "Movement" },
  { limbId: "health", threadType: "Nutrition", name: "Nutrition" },
  { limbId: "health", threadType: "Appearance", name: "Appearance" },
  { limbId: "health", threadType: "Rest", name: "Rest" },
] as const;

/** @deprecated Prefer {@link hubsForTheme}. Maximum hubs on any single theme. */
export const HUBS_PER_THEME = 4;

/** Legacy hub labels → normalized key for matching template slots (lowercase). */
export const HUB_LABEL_ALIASES: Record<string, string> = {
  purpose: "purpose & values",
  spirituality: "purpose & values",
  meaning: "purpose & values",
  "inner life": "mind & emotions",
  mind: "mind & emotions",
  "inner work": "mind & emotions",
  reflection: "mind & emotions",
  habits: "mind & emotions",
  joy: "joy & creativity",
  projects: "builds & launches",
  protection: "safety net",
  giving: "liabilities",
  network: "skills",
  community: "friendships",
  play: "hobbies",
  downtime: "rest",
  recovery: "rest",
  upgrades: "appearance",
  energy: "appearance",
  investing: "assets",
  investments: "assets",
  sleep: "rest",
  debt: "liabilities",
  "debt & obligations": "liabilities",
};

/** Legacy DB root labels → current theme + hub display name (sync migration). */
export const LEGACY_HUB_MIGRATIONS: Record<string, { limbId: LifeAreaId; label: string }> = {
  purpose: { limbId: "becoming", label: "Purpose & Values" },
  spirituality: { limbId: "becoming", label: "Purpose & Values" },
  meaning: { limbId: "becoming", label: "Purpose & Values" },
  "inner life": { limbId: "becoming", label: "Mind & Emotions" },
  projects: { limbId: "work", label: "Builds & Launches" },
  mind: { limbId: "becoming", label: "Mind & Emotions" },
  "inner work": { limbId: "becoming", label: "Mind & Emotions" },
  reflection: { limbId: "becoming", label: "Mind & Emotions" },
  habits: { limbId: "becoming", label: "Mind & Emotions" },
  protection: { limbId: "finance", label: "Safety net" },
  giving: { limbId: "finance", label: "Liabilities" },
  network: { limbId: "work", label: "Skills" },
  community: { limbId: "people", label: "Friendships" },
  joy: { limbId: "becoming", label: "Joy & Creativity" },
  /** Legacy rows already on becoming/Joy stay put — no retroactive move to pleasures. */
  hobbies: { limbId: "becoming", label: "Joy & Creativity" },
  culture: { limbId: "becoming", label: "Joy & Creativity" },
  experiences: { limbId: "becoming", label: "Joy & Creativity" },
  creativity: { limbId: "becoming", label: "Joy & Creativity" },
  downtime: { limbId: "health", label: "Rest" },
  recovery: { limbId: "health", label: "Rest" },
  upgrades: { limbId: "health", label: "Appearance" },
  investing: { limbId: "finance", label: "Assets" },
  investments: { limbId: "finance", label: "Assets" },
  sleep: { limbId: "health", label: "Rest" },
  rest: { limbId: "health", label: "Rest" },
  play: { limbId: "becoming", label: "Joy & Creativity" },
  debt: { limbId: "finance", label: "Liabilities" },
  "debt & obligations": { limbId: "finance", label: "Liabilities" },
};

export function normalizeHubLabelKey(label: string): string {
  const base = label.trim().toLowerCase();
  return HUB_LABEL_ALIASES[base] ?? base;
}

/** @alias normalizeHubLabelKey */
export function hubMatchKey(label: string): string {
  return normalizeHubLabelKey(label);
}

export function hubsForTheme(themeId: LifeAreaId): readonly HubTemplate[] {
  return LOCKED_HUB_TEMPLATES.filter((t) => t.limbId === themeId);
}

export function hubCountForTheme(themeId: LifeAreaId): number {
  return hubsForTheme(themeId).length;
}

export function validHubLabelKeysForTheme(themeId: LifeAreaId): Set<string> {
  return new Set(hubsForTheme(themeId).map((t) => normalizeHubLabelKey(t.threadType)));
}

export {
  HUB_LUCIDE_ICONS,
  HUB_LUCIDE_ICON_SLOT_ORDER,
  HUB_LUCIDE_ICON_SLUGS,
  hubLucideIconSlug,
  type HubLucideIconSlug,
} from "./hub-lucide-icons";
