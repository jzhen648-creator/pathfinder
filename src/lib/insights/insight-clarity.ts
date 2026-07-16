/**
 * Shared plain-interpretation clarity checks for theme/overall/chapter headlines.
 * Used by post-gen gates, quality eval, and mobile display normalization.
 *
 * Insights interpret the map — they must not audit it. Milestone ratios, raw
 * days-until-deadline, status labels, and active counts are administrative
 * echo and fail as standalone reading copy.
 */

/** Metaphor / riddle tails that compress facts into pseudo-profound closers. */
export const RIDDLE_CLOSER_PATTERNS: RegExp[] = [
  /\b(?:is|remains|stays|becomes)\s+(?:still\s+)?the\s+story\b/i,
  /\bthe\s+gap\s+(?:is|remains|stays)\s+(?:still\s+)?the\s+story\b/i,
  /\b(?:long[- ]range\s+)?anchor\b/i,
  /\bthrough[- ]line\b/i,
  /\bdefines?\s+(?:the\s+)?(?:theme|picture|map|story)\b/i,
  /\bcarries?\s+(?:the\s+)?(?:theme|picture|story)\b/i,
];

/** Generic tension closers that add no map substance when used alone. */
export const GENERIC_TENSION_CLOSER =
  /\b(?:those\s+)?(?:two\s+)?facts?\s+sit\s+in\s+tension\b|\bsit(?:s)?\s+in\s+tension\s*[.!]?\s*$/i;

/** Days at or below this count may support a headline when paired with another frontier. */
export const URGENT_DEADLINE_DAYS = 45;

const HAS_CURRENCY = /[£$€]/
const AMOUNT_RELATIONSHIP =
  /\b\d[\d,]*(?:\.\d+)?\s*(?:of|\/|against|vs\.?)\s*[£$€]?\s*\d/i;
const AGE_CHRONOLOGY = /\bat\s+\d{1,2}\b/i;

const MILESTONE_RATIO =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:of|\/)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+milestones?\b/i;
const DEADLINE_IN_DAYS = /\bdeadline\s+in\s+(\d+)\s*d(?:ays?)?\b/i;
const DEADLINE_ND = /\bdeadline\s+(\d+)d\b/i;
const DEADLINE_PAREN_DAYS = /\((\d+)d\)/i;
const DEADLINE_MONTHS_YEARS =
  /\bdeadline\s+in\s+\d+\s*(?:months?|years?)\b/i;
const TARGET_DATE_AUDIT =
  /\btarget\s+date\s+(?:is\s+today|passed)\b|\bpassed\s+\d+\s+days?\s+ago\b/i;
const STATUS_NARRATION =
  /\b(?:is\s+)?(?:an?\s+)?active\s+pursuit\b|\bin\s+progress\b|\bongoing\b|\bcurrently\s+working\b|\bprogressing\s+well\b/i;
const SIGNIFICANCE_LABEL =
  /\bsignificance\s*[:\-]?\s*(?:background|meaningful|pivotal|\d)\b/i;
const ACTIVE_COUNT =
  /\b\d+\s+active\b|\b\d+\s+in\s+progress\b|\bno\s+chapters?\s+in\s+progress\b|\(\d+\s+active\)/i;
const MILESTONE_COMPLETE_TAIL = /\bmilestones?\s+complete(?:d)?\b/i;
const NUMBER_WORDS_OF =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+of\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/i;
const STARTED_ONLY = /^started\s+[a-z]{3,9}\s+\d{4}$/i;

const TITLE_STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "into",
  "onto",
  "over",
  "under",
  "after",
  "before",
  "against",
  "still",
  "both",
  "only",
  "just",
  "have",
  "has",
  "had",
  "are",
  "was",
  "were",
  "been",
  "being",
  "chapter",
  "chapters",
  "theme",
  "story",
  "gap",
  "plan",
  "map",
  "deadline",
  "days",
  "day",
  "months",
  "month",
  "years",
  "year",
  "active",
  "progress",
  "complete",
  "completed",
  "milestones",
  "milestone",
]);

export function significantClarityTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9£$€]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TITLE_STOP.has(token));
}

function stripAdministrativeFragments(text: string): string {
  return text
    .replace(MILESTONE_RATIO, " ")
    .replace(NUMBER_WORDS_OF, " ")
    .replace(DEADLINE_IN_DAYS, " ")
    .replace(DEADLINE_ND, " ")
    .replace(DEADLINE_PAREN_DAYS, " ")
    .replace(DEADLINE_MONTHS_YEARS, " ")
    .replace(TARGET_DATE_AUDIT, " ")
    .replace(STATUS_NARRATION, " ")
    .replace(SIGNIFICANCE_LABEL, " ")
    .replace(ACTIVE_COUNT, " ")
    .replace(MILESTONE_COMPLETE_TAIL, " ")
    .replace(/\bstatus\s*:\s*\w+\b/gi, " ")
    .replace(/[·|;,.\-—:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maxDeadlineDaysMentioned(text: string): number | null {
  let max: number | null = null;
  for (const pattern of [DEADLINE_IN_DAYS, DEADLINE_ND, DEADLINE_PAREN_DAYS]) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const days = Number(match[1]);
    if (!Number.isFinite(days)) continue;
    max = max == null ? days : Math.max(max, days);
  }
  return max;
}

/**
 * True when the line is primarily status/plan inventory the UI already owns
 * (milestones tab, meta strip, Timeline) rather than interpretation.
 */
export function isAdministrativeEcho(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (STARTED_ONLY.test(trimmed)) return true;

  const remainder = stripAdministrativeFragments(trimmed);
  const remainderTokens = significantClarityTokens(remainder);
  const hasAmount =
    HAS_CURRENCY.test(trimmed) || AMOUNT_RELATIONSHIP.test(trimmed);
  const hasAgeChronology = AGE_CHRONOLOGY.test(trimmed);

  if (hasAmount || hasAgeChronology) {
    // Amount/age lines may mention a deadline; still admin if the non-admin remainder is empty
    // AND the only other signal is a long-range day count with no named frontier.
    if (remainderTokens.length >= 1) return false;
  }

  if (remainderTokens.length >= 2) return false;

  const deadlineDays = maxDeadlineDaysMentioned(trimmed);
  if (deadlineDays != null && deadlineDays <= URGENT_DEADLINE_DAYS && remainderTokens.length >= 1) {
    return false;
  }

  // Dominated by milestone / deadline / status / count inventory.
  return (
    MILESTONE_RATIO.test(trimmed) ||
    NUMBER_WORDS_OF.test(trimmed) ||
    DEADLINE_IN_DAYS.test(trimmed) ||
    DEADLINE_ND.test(trimmed) ||
    DEADLINE_PAREN_DAYS.test(trimmed) ||
    DEADLINE_MONTHS_YEARS.test(trimmed) ||
    TARGET_DATE_AUDIT.test(trimmed) ||
    STATUS_NARRATION.test(trimmed) ||
    SIGNIFICANCE_LABEL.test(trimmed) ||
    ACTIVE_COUNT.test(trimmed) ||
    remainderTokens.length === 0
  );
}

export function hasConcreteMapSubstance(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isAdministrativeEcho(trimmed)) return false;

  if (HAS_CURRENCY.test(trimmed) || AMOUNT_RELATIONSHIP.test(trimmed)) return true;
  if (AGE_CHRONOLOGY.test(trimmed) && significantClarityTokens(trimmed).length >= 2) {
    return true;
  }

  const deadlineDays = maxDeadlineDaysMentioned(trimmed);
  if (deadlineDays != null && deadlineDays <= URGENT_DEADLINE_DAYS) {
    const remainder = stripAdministrativeFragments(trimmed);
    if (significantClarityTokens(remainder).length >= 1) return true;
  }

  return significantClarityTokens(trimmed).length >= 3;
}

export function hasRiddleCloser(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return RIDDLE_CLOSER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function hasGenericTensionCloser(text: string): boolean {
  return GENERIC_TENSION_CLOSER.test(text.trim());
}

/**
 * True when a headline is clear enough for Insights display.
 * Metaphor-only closers and administrative inventory fail.
 */
export function isClearInsightHeadline(
  text: string,
  options?: { knownTitleTokens?: readonly string[] },
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (hasRiddleCloser(trimmed)) return false;
  if (isAdministrativeEcho(trimmed)) return false;

  if (
    hasGenericTensionCloser(trimmed) &&
    !HAS_CURRENCY.test(trimmed) &&
    !AMOUNT_RELATIONSHIP.test(trimmed)
  ) {
    return false;
  }

  if (hasConcreteMapSubstance(trimmed)) return true;

  const known = (options?.knownTitleTokens ?? [])
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3);
  if (known.length === 0) return false;

  const lower = trimmed.toLowerCase();
  const matched = known.filter((token) => lower.includes(token));
  // Title token alone is not enough — need another concrete token beyond stopwords.
  return matched.length >= 1 && significantClarityTokens(trimmed).length >= 3;
}

/** Soften or blank a cryptic / administrative headline for display / post-gen gates. */
export function clarifyInsightHeadline(
  text: string,
  options?: { knownTitleTokens?: readonly string[]; fallback?: string },
): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (isClearInsightHeadline(trimmed, options)) return trimmed;
  const fallback = options?.fallback?.trim() ?? "";
  if (fallback && isClearInsightHeadline(fallback, options)) return fallback;
  return "";
}

export function claimsRoughlyEqual(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 20 || right.length < 20) return false;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = significantClarityTokens(left);
  const rightTokens = significantClarityTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  const matched = leftTokens.filter((token) => rightTokens.includes(token));
  if (matched.length >= Math.min(3, leftTokens.length, rightTokens.length)) return true;
  return matched.length / Math.min(leftTokens.length, rightTokens.length) >= 0.65;
}

/** Focal-fact lines that must not become chapter headlines. */
export function isAdministrativeFocalFact(fact: string): boolean {
  const trimmed = fact.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("Status:")) return true;
  if (trimmed.startsWith("Significance:")) return true;
  if (trimmed.startsWith("Reading signal: gap")) return true;
  if (/^Deadline:.*\(\d+d\)/i.test(trimmed)) {
    const match = trimmed.match(/\((\d+)d\)/i);
    const days = match?.[1] ? Number(match[1]) : null;
    if (days == null || days > URGENT_DEADLINE_DAYS) return true;
  }
  if (MILESTONE_RATIO.test(trimmed)) return true;
  if (/\d+\s*\/\s*\d+\s+milestones?/i.test(trimmed)) return true;
  if (/0 of \d+ milestones/i.test(trimmed)) return true;
  return isAdministrativeEcho(trimmed);
}
