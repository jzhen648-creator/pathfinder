import { isValidLucideSlug } from "@/lib/icons/enumerate-lucide-slugs";

/** Theme default icons — keep in sync with pathfinder-mobile/lib/icons/theme-lucide-icons.ts */
const THEME_ICON_SLUGS = new Set([
  "briefcase",
  "wallet",
  "compass",
  "palette",
  "users",
  "heart-pulse",
]);

const KEBAB_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs accepted on PATCH goal.iconName — matches mobile picker + theme defaults.
 * Falls back to kebab-case when Lucide enumeration is unavailable (some serverless bundles).
 */
export function isValidStoredPursuitIconSlug(slug: string): boolean {
  if (THEME_ICON_SLUGS.has(slug)) return true;
  if (isValidLucideSlug(slug)) return true;
  return slug.length <= 64 && KEBAB_SLUG_RE.test(slug);
}
