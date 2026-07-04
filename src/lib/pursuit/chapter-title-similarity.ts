const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "for",
  "to",
  "my",
  "our",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
]);

function tokenizeTitle(title: string): Set<string> {
  const tokens = title
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !TITLE_STOP_WORDS.has(token));
  return new Set(tokens);
}

/** Jaccard similarity on meaningful title tokens (0 = unrelated, 1 = identical). */
export function chapterTitleTokenSimilarity(previousTitle: string, nextTitle: string): number {
  const previous = tokenizeTitle(previousTitle);
  const next = tokenizeTitle(nextTitle);
  if (previous.size === 0 && next.size === 0) return 1;
  if (previous.size === 0 || next.size === 0) return 0;

  let intersection = 0;
  for (const token of previous) {
    if (next.has(token)) intersection += 1;
  }
  const union = previous.size + next.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Below this threshold, a rename is treated as a significant semantic shift. */
export const CHAPTER_TITLE_RENAME_WARN_SIMILARITY = 0.35;

export function shouldWarnChapterTitleRename(input: {
  previousTitle: string;
  nextTitle: string;
  enrichAnswerCount: number;
  milestoneCount: number;
}): boolean {
  const previous = input.previousTitle.trim();
  const next = input.nextTitle.trim();
  if (!previous || !next || previous.toLowerCase() === next.toLowerCase()) return false;
  if (input.enrichAnswerCount <= 0 && input.milestoneCount <= 0) return false;
  return (
    chapterTitleTokenSimilarity(previous, next) < CHAPTER_TITLE_RENAME_WARN_SIMILARITY
  );
}
