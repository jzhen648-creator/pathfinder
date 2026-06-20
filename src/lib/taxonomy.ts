import type { LifeAreaId } from "./types";

/** Bump when locked theme/category names change (sync + docs). */
export const TAXONOMY_VERSION = "2026-06-20-v13-timeless-category-labels" as const;

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

/** Locked default root taxonomy categories — AI routing slots (not map geometry). */
export const LOCKED_CATEGORY_TEMPLATES: readonly HubTemplate[] = [
  { limbId: "finance", threadType: "Pay from work", name: "Pay from work" },
  { limbId: "finance", threadType: "Property income", name: "Property income" },
  { limbId: "finance", threadType: "Business & freelance", name: "Business & freelance" },
  { limbId: "finance", threadType: "Assets & investing", name: "Assets & investing" },
  { limbId: "finance", threadType: "Safety net & insurance", name: "Safety net & insurance" },
  { limbId: "finance", threadType: "Debts & loans", name: "Debts & loans" },
  { limbId: "work", threadType: "Jobs & roles", name: "Jobs & roles" },
  { limbId: "work", threadType: "Qualifications", name: "Qualifications" },
  { limbId: "work", threadType: "Education & courses", name: "Education & courses" },
  { limbId: "work", threadType: "Projects & launches", name: "Projects & launches" },
  { limbId: "work", threadType: "Career search", name: "Career search" },
  { limbId: "becoming", threadType: "Values & direction", name: "Values & direction" },
  { limbId: "becoming", threadType: "Mind & wellbeing", name: "Mind & wellbeing" },
  { limbId: "pleasures", threadType: "Hobbies & making", name: "Hobbies & making" },
  { limbId: "pleasures", threadType: "Books, film & culture", name: "Books, film & culture" },
  { limbId: "pleasures", threadType: "Trips & events", name: "Trips & events" },
  { limbId: "people", threadType: "Family", name: "Family" },
  { limbId: "people", threadType: "Partner & romance", name: "Partner & romance" },
  { limbId: "people", threadType: "Friends & community", name: "Friends & community" },
  { limbId: "health", threadType: "Training & sport", name: "Training & sport" },
  { limbId: "health", threadType: "Food & nutrition", name: "Food & nutrition" },
  { limbId: "health", threadType: "Body care", name: "Body care" },
  { limbId: "health", threadType: "Rest & recovery", name: "Rest & recovery" },
] as const;

/** Legacy category labels → normalized key for matching template slots (lowercase). */
export const CATEGORY_LABEL_ALIASES: Record<string, string> = {
  purpose: "values & direction",
  spirituality: "values & direction",
  meaning: "values & direction",
  "purpose & values": "values & direction",
  "inner life": "mind & wellbeing",
  mind: "mind & wellbeing",
  "inner work": "mind & wellbeing",
  reflection: "mind & wellbeing",
  habits: "mind & wellbeing",
  "mind & emotions": "mind & wellbeing",
  joy: "mind & wellbeing",
  "joy & creativity": "mind & wellbeing",
  projects: "projects & launches",
  "projects & shipping": "projects & launches",
  "builds & launches": "projects & launches",
  career: "jobs & roles",
  "career & role": "jobs & roles",
  job: "jobs & roles",
  skills: "qualifications",
  "skills & learning": "qualifications",
  qualification: "qualifications",
  qualifications: "qualifications",
  education: "education & courses",
  course: "education & courses",
  "career search": "career search",
  "job search": "career search",
  income: "pay from work",
  salary: "pay from work",
  payroll: "pay from work",
  "employment income": "pay from work",
  rental: "property income",
  "rental income": "property income",
  "property income": "property income",
  "rental & property income": "property income",
  landlord: "property income",
  btl: "property income",
  "buy to let": "property income",
  freelance: "business & freelance",
  "self-employed": "business & freelance",
  "self employed": "business & freelance",
  business: "business & freelance",
  "business & freelance income": "business & freelance",
  assets: "assets & investing",
  investing: "assets & investing",
  investments: "assets & investing",
  protection: "safety net & insurance",
  "safety net": "safety net & insurance",
  giving: "debts & loans",
  liabilities: "debts & loans",
  debt: "debts & loans",
  "debt & obligations": "debts & loans",
  "debts & obligations": "debts & loans",
  network: "qualifications",
  community: "friends & community",
  friendships: "friends & community",
  romance: "partner & romance",
  play: "hobbies & making",
  hobbies: "hobbies & making",
  culture: "books, film & culture",
  experiences: "trips & events",
  downtime: "rest & recovery",
  recovery: "rest & recovery",
  sleep: "rest & recovery",
  rest: "rest & recovery",
  "rest & sleep": "rest & recovery",
  upgrades: "body care",
  energy: "body care",
  appearance: "body care",
  "body & grooming": "body care",
  movement: "training & sport",
  nutrition: "food & nutrition",
};

/** Legacy DB root labels → current theme + hub display name (sync migration). */
export const LEGACY_HUB_MIGRATIONS: Record<string, { limbId: LifeAreaId; label: string }> = {
  purpose: { limbId: "becoming", label: "Values & direction" },
  spirituality: { limbId: "becoming", label: "Values & direction" },
  meaning: { limbId: "becoming", label: "Values & direction" },
  "purpose & values": { limbId: "becoming", label: "Values & direction" },
  "inner life": { limbId: "becoming", label: "Mind & wellbeing" },
  projects: { limbId: "work", label: "Projects & launches" },
  "builds & launches": { limbId: "work", label: "Projects & launches" },
  "projects & shipping": { limbId: "work", label: "Projects & launches" },
  career: { limbId: "work", label: "Jobs & roles" },
  "career & role": { limbId: "work", label: "Jobs & roles" },
  job: { limbId: "work", label: "Jobs & roles" },
  skills: { limbId: "work", label: "Qualifications" },
  "skills & learning": { limbId: "work", label: "Qualifications" },
  mind: { limbId: "becoming", label: "Mind & wellbeing" },
  "inner work": { limbId: "becoming", label: "Mind & wellbeing" },
  reflection: { limbId: "becoming", label: "Mind & wellbeing" },
  habits: { limbId: "becoming", label: "Mind & wellbeing" },
  "mind & emotions": { limbId: "becoming", label: "Mind & wellbeing" },
  protection: { limbId: "finance", label: "Safety net & insurance" },
  "safety net": { limbId: "finance", label: "Safety net & insurance" },
  giving: { limbId: "finance", label: "Debts & loans" },
  income: { limbId: "finance", label: "Pay from work" },
  "employment income": { limbId: "finance", label: "Pay from work" },
  assets: { limbId: "finance", label: "Assets & investing" },
  investing: { limbId: "finance", label: "Assets & investing" },
  investments: { limbId: "finance", label: "Assets & investing" },
  liabilities: { limbId: "finance", label: "Debts & loans" },
  debt: { limbId: "finance", label: "Debts & loans" },
  "debt & obligations": { limbId: "finance", label: "Debts & loans" },
  "debts & obligations": { limbId: "finance", label: "Debts & loans" },
  "rental & property income": { limbId: "finance", label: "Property income" },
  "business & freelance income": { limbId: "finance", label: "Business & freelance" },
  network: { limbId: "work", label: "Qualifications" },
  community: { limbId: "people", label: "Friends & community" },
  friendships: { limbId: "people", label: "Friends & community" },
  romance: { limbId: "people", label: "Partner & romance" },
  joy: { limbId: "becoming", label: "Mind & wellbeing" },
  "joy & creativity": { limbId: "becoming", label: "Mind & wellbeing" },
  hobbies: { limbId: "pleasures", label: "Hobbies & making" },
  culture: { limbId: "pleasures", label: "Books, film & culture" },
  experiences: { limbId: "pleasures", label: "Trips & events" },
  creativity: { limbId: "becoming", label: "Mind & wellbeing" },
  play: { limbId: "pleasures", label: "Hobbies & making" },
  downtime: { limbId: "health", label: "Rest & recovery" },
  recovery: { limbId: "health", label: "Rest & recovery" },
  sleep: { limbId: "health", label: "Rest & recovery" },
  rest: { limbId: "health", label: "Rest & recovery" },
  "rest & sleep": { limbId: "health", label: "Rest & recovery" },
  upgrades: { limbId: "health", label: "Body care" },
  energy: { limbId: "health", label: "Body care" },
  appearance: { limbId: "health", label: "Body care" },
  "body & grooming": { limbId: "health", label: "Body care" },
  movement: { limbId: "health", label: "Training & sport" },
  nutrition: { limbId: "health", label: "Food & nutrition" },
};

export function categoriesForTheme(themeId: LifeAreaId): readonly HubTemplate[] {
  return LOCKED_CATEGORY_TEMPLATES.filter((t) => t.limbId === themeId);
}

export function categoryCountForTheme(themeId: LifeAreaId): number {
  return categoriesForTheme(themeId).length;
}

export function validCategoryLabelKeysForTheme(themeId: LifeAreaId): Set<string> {
  return new Set(categoriesForTheme(themeId).map((t) => normalizeCategoryLabelKey(t.threadType)));
}

export function normalizeCategoryLabelKey(label: string): string {
  const base = label.trim().toLowerCase();
  return CATEGORY_LABEL_ALIASES[base] ?? base;
}

export function categorySlugKey(label: string): string {
  return normalizeCategoryLabelKey(label);
}

export {
  CATEGORY_LUCIDE_ICONS,
  CATEGORY_LUCIDE_ICON_SLOT_ORDER,
  CATEGORY_LUCIDE_ICON_SLUGS,
  categoryLucideIconSlug,
  type CategoryLucideIconSlug,
} from "./category-lucide-icons";
