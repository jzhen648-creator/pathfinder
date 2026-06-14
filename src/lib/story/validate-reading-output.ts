/** Post-generation quality checks for Insights Reading prose (seasonRead). */

export const BANNED_READING_PHRASES = [
  "it will be interesting to see",
  "only time will tell",
  "keep building",
  "as they take shape",
  "journey",
] as const;

/** Backward-looking arc language — banned when Arrival facts were starved from the packet. */
export const ARRIVAL_LANGUAGE_PHRASES = [
  "looking back",
  "momentum built",
  "arc",
  "completed arc",
  "what you've finished",
  "what you have finished",
  "over the past",
  "recently completed",
] as const;

export type ReadingDepthMode = "sparse" | "panoramic";

export type ReadingQualityOptions = {
  pursuitTitles: string[];
  /** sparse = 1–2 pursuits; panoramic = 3+ */
  depthMode: ReadingDepthMode;
  /** When set, every title must appear verbatim in seasonRead. */
  requireAllTitles?: boolean;
  /** When true, flag backward/arc language (Arrival starved). */
  noArrivalLanguage?: boolean;
  /** High-significance pursuits with near deadlines that must be named (Gap lens). */
  requiredGapTitles?: string[];
};

export type ReadingQualityIssue = {
  code:
    | "empty"
    | "banned_phrase"
    | "missing_title"
    | "word_count"
    | "arrival_language"
    | "gap_not_named";
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

  if (options.noArrivalLanguage) {
    for (const phrase of ARRIVAL_LANGUAGE_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: "arrival_language",
          message: `Arrival language when starved: "${phrase}"`,
        });
      }
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

  for (const title of options.requiredGapTitles ?? []) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    if (!text.includes(trimmed)) {
      issues.push({
        code: "gap_not_named",
        message: `Gap pursuit not named: "${trimmed}"`,
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
