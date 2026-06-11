import type { LifeAreaId } from "./types";

/** Bump when locked theme/hub names change (sync + docs). */
export const TAXONOMY_VERSION = "2026-06-11-v10-work-job-category" as const;

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

/** Locked default root hubs — AI routing categories (not map geometry). */
export const LOCKED_HUB_TEMPLATES: readonly HubTemplate[] = [
  { limbId: "finance", threadType: "Employment income", name: "Employment income" },
  { limbId: "finance", threadType: "Rental & property income", name: "Rental & property income" },
  { limbId: "finance", threadType: "Business & freelance income", name: "Business & freelance income" },
  { limbId: "finance", threadType: "Assets & investing", name: "Assets & investing" },
  { limbId: "finance", threadType: "Safety net", name: "Safety net" },
  { limbId: "finance", threadType: "Debts & obligations", name: "Debts & obligations" },
  { limbId: "work", threadType: "Job", name: "Job" },
  { limbId: "work", threadType: "Skills & learning", name: "Skills & learning" },
  { limbId: "work", threadType: "Projects & shipping", name: "Projects & shipping" },
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
  { limbId: "health", threadType: "Body & grooming", name: "Body & grooming" },
  { limbId: "health", threadType: "Rest & sleep", name: "Rest & sleep" },
] as const;

/** @deprecated Prefer {@link hubsForTheme}. Maximum hubs on any single theme. */
export const HUBS_PER_THEME = 6;

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
  projects: "projects & shipping",
  "builds & launches": "projects & shipping",
  career: "job",
  "career & role": "job",
  skills: "skills & learning",
  income: "employment income",
  salary: "employment income",
  payroll: "employment income",
  rental: "rental & property income",
  "rental income": "rental & property income",
  "property income": "rental & property income",
  landlord: "rental & property income",
  btl: "rental & property income",
  "buy to let": "rental & property income",
  freelance: "business & freelance income",
  "self-employed": "business & freelance income",
  "self employed": "business & freelance income",
  business: "business & freelance income",
  assets: "assets & investing",
  investing: "assets & investing",
  investments: "assets & investing",
  protection: "safety net",
  giving: "debts & obligations",
  liabilities: "debts & obligations",
  debt: "debts & obligations",
  "debt & obligations": "debts & obligations",
  network: "skills & learning",
  community: "friendships",
  play: "hobbies",
  downtime: "rest & sleep",
  recovery: "rest & sleep",
  sleep: "rest & sleep",
  rest: "rest & sleep",
  upgrades: "body & grooming",
  energy: "body & grooming",
  appearance: "body & grooming",
};

/** Legacy DB root labels → current theme + hub display name (sync migration). */
export const LEGACY_HUB_MIGRATIONS: Record<string, { limbId: LifeAreaId; label: string }> = {
  purpose: { limbId: "becoming", label: "Purpose & Values" },
  spirituality: { limbId: "becoming", label: "Purpose & Values" },
  meaning: { limbId: "becoming", label: "Purpose & Values" },
  "inner life": { limbId: "becoming", label: "Mind & Emotions" },
  projects: { limbId: "work", label: "Projects & shipping" },
  "builds & launches": { limbId: "work", label: "Projects & shipping" },
  career: { limbId: "work", label: "Job" },
  "career & role": { limbId: "work", label: "Job" },
  skills: { limbId: "work", label: "Skills & learning" },
  mind: { limbId: "becoming", label: "Mind & Emotions" },
  "inner work": { limbId: "becoming", label: "Mind & Emotions" },
  reflection: { limbId: "becoming", label: "Mind & Emotions" },
  habits: { limbId: "becoming", label: "Mind & Emotions" },
  protection: { limbId: "finance", label: "Safety net" },
  giving: { limbId: "finance", label: "Debts & obligations" },
  income: { limbId: "finance", label: "Employment income" },
  assets: { limbId: "finance", label: "Assets & investing" },
  investing: { limbId: "finance", label: "Assets & investing" },
  investments: { limbId: "finance", label: "Assets & investing" },
  liabilities: { limbId: "finance", label: "Debts & obligations" },
  debt: { limbId: "finance", label: "Debts & obligations" },
  "debt & obligations": { limbId: "finance", label: "Debts & obligations" },
  network: { limbId: "work", label: "Skills & learning" },
  community: { limbId: "people", label: "Friendships" },
  joy: { limbId: "becoming", label: "Joy & Creativity" },
  hobbies: { limbId: "becoming", label: "Joy & Creativity" },
  culture: { limbId: "becoming", label: "Joy & Creativity" },
  experiences: { limbId: "becoming", label: "Joy & Creativity" },
  creativity: { limbId: "becoming", label: "Joy & Creativity" },
  downtime: { limbId: "health", label: "Rest & sleep" },
  recovery: { limbId: "health", label: "Rest & sleep" },
  sleep: { limbId: "health", label: "Rest & sleep" },
  rest: { limbId: "health", label: "Rest & sleep" },
  play: { limbId: "becoming", label: "Joy & Creativity" },
  upgrades: { limbId: "health", label: "Body & grooming" },
  energy: { limbId: "health", label: "Body & grooming" },
  appearance: { limbId: "health", label: "Body & grooming" },
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
