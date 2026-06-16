const AMOUNT_IN_TITLE =
  /(?:£|\$|€)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:gbp|usd|eur|k|m)\b|\b\d{4,}\b/i;

/** Map labels should stay category/outcome names — not amounts or dated figures. */
export function titleLooksOverSpecific(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (AMOUNT_IN_TITLE.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (words.length > 8) return true;
  return false;
}

/** Strip leading amounts / "in" phrasing → stable label (e.g. rental income). */
export function generalizePursuitTitle(title: string): string {
  let next = title.trim();
  next = next.replace(
    /^(?:£|\$|€)?\s*[\d,]+(?:\.\d+)?(?:\s*(?:gbp|usd|eur|k|m))?\s+(?:in|from|of|for|on)\s+/i,
    "",
  );
  next = next.replace(/^(?:£|\$|€)\s*[\d,]+(?:\.\d+)?\s*[-–—]?\s*/i, "");
  next = next.replace(/\s+/g, " ").trim();
  if (!next) return title.trim();
  return next.charAt(0).toUpperCase() + next.slice(1);
}

export function preferExistingMapTitle(existingTitle: string, proposedTitle: string | undefined): boolean {
  const proposed = proposedTitle?.trim();
  if (!proposed) return true;
  const existing = existingTitle.trim();
  if (!existing) return false;
  if (titleLooksOverSpecific(proposed) && !titleLooksOverSpecific(existing)) return true;
  if (
    titleLooksOverSpecific(proposed) &&
    titleLooksOverSpecific(existing) &&
    proposed.length > existing.length + 8
  ) {
    return true;
  }
  return false;
}

/** Regenerated summary — replaces prior description wholesale (not a merge). */
export function replacePursuitContextDescription(
  _previous: string | null | undefined,
  next: string,
): string {
  return next.trim().slice(0, 2000);
}
