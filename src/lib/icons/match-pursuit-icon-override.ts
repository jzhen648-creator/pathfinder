import { isValidLucideSlug } from "@/lib/icons/enumerate-lucide-slugs";
import {
  PURSUIT_ICON_PREFERRED_OVERRIDES,
  type PursuitIconOverride,
} from "@/lib/icons/pursuit-icon-overrides";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function conceptMatches(haystack: string, concept: string): boolean {
  const c = concept.trim().toLowerCase();
  if (!c) return false;
  if (c.includes(" ")) {
    return haystack.includes(c);
  }
  return new RegExp(`\\b${escapeRegExp(c)}\\b`, "i").test(haystack);
}

/** First preferred override whose concept matches title/description. */
export function matchPreferredOverrideIconSlug(
  title: string,
  description?: string | null,
): string | null {
  const haystack = `${title} ${description ?? ""}`.trim().toLowerCase();
  if (!haystack) return null;

  for (const row of PURSUIT_ICON_PREFERRED_OVERRIDES) {
    const slug = row.iconSlug;
    if (!slug) continue;
    if (!row.concepts.some((concept) => conceptMatches(haystack, concept))) continue;
    if (isValidLucideSlug(slug)) return slug;
  }
  return null;
}

export type { PursuitIconOverride };
