/**
 * UTILS — Label Helpers
 *
 * Shared helpers for label formatting.
 */

export function truncateLabel(value: string, maxWords = 5) {
  return value.trim().split(" ").slice(0, maxWords).join(" ");
}

