/** Post-generation quality checks for Insights Reading prose (seasonRead). */

export const BANNED_READING_PHRASES = [
  "it will be interesting to see",
  "only time will tell",
  "keep building",
  "as they take shape",
  "journey",
] as const;

export type ReadingDepthMode = "sparse" | "panoramic";

export type ReadingQualityOptions = {
  pursuitTitles: string[];
  /** sparse = 1–2 pursuits; panoramic = 3+ */
  depthMode: ReadingDepthMode;
  /** When set, every title must appear verbatim in seasonRead. */
  requireAllTitles?: boolean;
};

export type ReadingQualityIssue = {
  code: "empty" | "banned_phrase" | "missing_title" | "word_count";
  message: string;
};

export type ReadingQualityResult = {
  ok: boolean;
  wordCount: number;
  issues: ReadingQualityIssue[];
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function validateReadingOutput(
  seasonRead: string,
  options: ReadingQualityOptions,
): ReadingQualityResult {
  const issues: ReadingQualityIssue[] = [];
  const text = seasonRead.trim();
  const wordCount = countWords(text);

  if (!text) {
    issues.push({ code: "empty", message: "seasonRead is empty" });
  }

  const lower = text.toLowerCase();
  for (const phrase of BANNED_READING_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push({
        code: "banned_phrase",
        message: `Banned phrase: "${phrase}"`,
      });
    }
  }

  const titlesToCheck =
    options.requireAllTitles || options.depthMode === "sparse"
      ? options.pursuitTitles
      : options.pursuitTitles.slice(0, 4);

  for (const title of titlesToCheck) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    if (!text.includes(trimmed)) {
      issues.push({
        code: "missing_title",
        message: `Pursuit title not verbatim: "${trimmed}"`,
      });
    }
  }

  if (options.depthMode === "sparse") {
    if (wordCount > 60) {
      issues.push({
        code: "word_count",
        message: `Sparse reading exceeds 60 words (got ${wordCount})`,
      });
    }
  } else {
    if (wordCount < 80 || wordCount > 160) {
      issues.push({
        code: "word_count",
        message: `Panoramic reading outside 80–160 words (got ${wordCount})`,
      });
    }
  }

  return { ok: issues.length === 0, wordCount, issues };
}
