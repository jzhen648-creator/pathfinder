/** Title has fewer than five words and no description — eligible for sparse-context enrich. */
export function isSparseContextItem(title: string, description?: string | null): boolean {
  const wordCount = title.trim().split(/\s+/).filter(Boolean).length;
  const hasDescription = Boolean(description?.trim());
  return wordCount < 5 && !hasDescription;
}
