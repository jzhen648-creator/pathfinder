const CANVAS_LABEL_SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "my",
  "with",
  "by",
]);

function capitalizeWordToken(word: string): string {
  if (!word) return word;
  if (/^[£$€]?\d+(?:\.\d+)?[kKmM]?$/.test(word)) {
    return word.replace(/m$/, "M");
  }
  const first = word.charAt(0);
  if (!first) return word;
  return first.toUpperCase() + word.slice(1).toLowerCase();
}

/** Words that were capitalized in the source title (e.g. London, Dad). */
function properNounsFromTitle(fullTitle: string): Map<string, string> {
  const out = new Map<string, string>();
  const words = fullTitle.match(/\b[\p{L}][\p{L}'’-]*\b/gu) ?? [];
  words.forEach((w, index) => {
    const first = w.charAt(0);
    const hasInternalUpper = /[\p{Ll}][\p{Lu}]|[\p{Lu}][\p{Ll}].*[\p{Lu}]/u.test(w);
    const allCaps = w.length > 1 && w === w.toUpperCase();
    const sentenceCaseOnly = index === 0 && !allCaps && !hasInternalUpper;
    if (w.length > 1 && first !== first.toLowerCase() && first === first.toUpperCase()) {
      if (!sentenceCaseOnly) out.set(w.toLowerCase(), w);
    }
  });
  return out;
}

/**
 * Readable canvas label casing: sentence case + proper nouns from the goal title.
 * Fixes all-lowercase AI short labels without re-running generation.
 */
export function formatCanvasLabelForDisplay(label: string, fullTitle?: string): string {
  const s = label.trim();
  if (!s) return s;

  const proper = fullTitle ? properNounsFromTitle(fullTitle) : new Map<string, string>();
  const words = s.split(/\s+/).filter(Boolean);

  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (/^[£$€]?\d+(?:\.\d+)?[kKmM]?$/.test(word)) return word.replace(/m$/, "M");
      const properWord = proper.get(lower);
      if (properWord) return properWord;
      if (i === 0) return capitalizeWordToken(word);
      if (CANVAS_LABEL_SMALL_WORDS.has(lower)) return lower;
      return lower;
    })
    .join(" ");
}
