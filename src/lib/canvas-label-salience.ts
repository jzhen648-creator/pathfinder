/** Generic goal words — fine to omit unless paired with a distinguisher. */

const GENERIC_WORDS = new Set([

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

  "get",

  "build",

  "start",

  "own",

  "home",

  "house",

  "flat",

  "place",

  "move",

  "before",

  "after",

  "through",

  "via",

  "cleanly",

  "situation",

  "resolve",

  "establish",

  "complete",

  "develop",

  "create",

  "achieve",

  "become",

  "find",

  "launch",

  "secure",

  "maintain",

  "reach",

  "grow",

]);



const MONTH_BEFORE_YEAR_RE =

  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*$/i;



/** Known multi-word constraints users care about on the tree. */

const SALIENT_PHRASE_PATTERNS: RegExp[] = [

  /\bshared ownership\b/gi,

  /\bjoint property\b/gi,

  /\bco-ownership\b/gi,

  /\bco ownership\b/gi,

  /\btransfer of equity\b/gi,

  /\bemergency fund\b/gi,

  /\bfirst[- ]time buyer\b/gi,

  /\bfirst[- ]time home\b/gi,

  /\bsalary sacrifice\b/gi,

  /\bspouse visa\b/gi,

  /\bmortgage broker\b/gi,

  /\bmortgage advisor\b/gi,

  /\bmortgage advising\b/gi,

  /\bstocks? & shares isa\b/gi,

  /\binvestment portfolio\b/gi,

  /\bsafety net\b/gi,

  /\bmuay thai\b/gi,

  /\bbefore (?:the )?london move\b/gi,

  /\bwith dad\b/gi,

  /\bwith mum\b/gi,

  /\bwith mom\b/gi,

  /\bwith my dad\b/gi,

  /\bwith my mum\b/gi,

  /\byoutube\b/gi,

  /\bsubscribers?\b/gi,

];



/** Words that disambiguate a numeric target (subs, currency, channel, etc.). */

const NUMERIC_UNIT_HINT_RE =

  /\b(subscribers?|subs|youtube|followers|views|revenue|users|customers|clients|deals|isa|pension|pensions|savings|portfolio|fund|kg|lbs?|miles?|km|sessions?|marathon)\b/gi;



const YEAR_LIKE_RE = /^(19|20)\d{2}$/;

/** Short but meaningful tokens that shortened labels often keep. */
const SHORT_SALIENT_WORDS = new Set(["isa", "subs", "dad", "mum", "mom"]);



/** £, $, € — amounts may appear as `£500k`, `$1.2M`, `€50,000`. */

const AMOUNT_SUFFIX_GROUP = "(?:\\s*(thousand|million|billion|bn|[km](?![a-z])))?";

const CURRENCY_AMOUNT_RE = new RegExp(
  `([£$€])\\s*(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)${AMOUNT_SUFFIX_GROUP}`,
  "gi",
);



function normalizeHaystack(title: string, description?: string | null): string {

  return `${title}\n${description ?? ""}`.trim();

}



type NumericTarget = { value: number; hints: string[]; currency?: string };



function parseNumericMagnitude(raw: string, suffix?: string): number | null {

  const digits = raw.replace(/,/g, "");

  const base = Number.parseFloat(digits);

  if (!Number.isFinite(base)) return null;

  const s = (suffix ?? "").toLowerCase();

  if (s === "k" || s === "thousand") return base * 1_000;

  if (s === "m" || s === "million") return base * 1_000_000;

  if (s === "bn" || s === "billion") return base * 1_000_000_000;

  return base;

}



/**

 * Calendar years (e.g. "by 2026", "Dec 2026") are deadlines — not magnitudes labels must echo.

 */

function isLikelyYearToken(

  value: number,

  hay: string,

  index: number,

  digitRaw: string,

  suffix?: string,

): boolean {

  if (value < 1900 || value > 2100) return false;

  if (suffix) return false;

  const digitsOnly = digitRaw.replace(/,/g, "");

  if (!/^\d{4}$/.test(digitsOnly)) return false;

  const before = hay.slice(Math.max(0, index - 28), index).toLowerCase();

  if (/\b(?:by|in|before|until|end of|year)\s*$/.test(before)) return true;

  if (MONTH_BEFORE_YEAR_RE.test(before)) return true;

  return true;

}

/** Reject `202` from `2026` when the regex only captured a year prefix. */
function isPartialYearPrefix(hay: string, index: number, digitRaw: string): boolean {
  const digitsOnly = digitRaw.replace(/,/g, "");
  if (digitsOnly.length >= 4 || digitsOnly.length === 0) return false;
  const tail = hay.slice(index + digitRaw.length).replace(/^\s+/, "");
  const combined = digitsOnly + tail.replace(/\D/g, "");
  return combined.length >= 4 && YEAR_LIKE_RE.test(combined.slice(0, 4));
}

/** Metric numbers from the goal (excludes bare deadline years). */

export function extractNumericTargets(title: string, description?: string | null): NumericTarget[] {

  const hay = normalizeHaystack(title, description);

  const targets: NumericTarget[] = [];

  let m: RegExpExecArray | null;



  CURRENCY_AMOUNT_RE.lastIndex = 0;

  while ((m = CURRENCY_AMOUNT_RE.exec(hay)) !== null) {

    const currency = m[1]!;

    const value = parseNumericMagnitude(m[2]!, m[3]);

    if (value == null || value < 10) continue;

    const digitIndex = m.index + m[0].indexOf(m[2]!);
    if (isLikelyYearToken(value, hay, digitIndex, m[2]!, m[3])) continue;
    if (isPartialYearPrefix(hay, digitIndex, m[2]!)) continue;

    const tail = hay.slice(m.index + m[0].length, m.index + m[0].length + 48);

    const hints = [...(tail.match(NUMERIC_UNIT_HINT_RE) ?? [])].map((h) => h.toLowerCase());

    targets.push({ value, hints: [...new Set(hints)], currency });

  }



  const plainAmountRe = new RegExp(
    `(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)${AMOUNT_SUFFIX_GROUP}`,
    "gi",
  );

  plainAmountRe.lastIndex = 0;

  while ((m = plainAmountRe.exec(hay)) !== null) {

    const start = m.index;

    const prefix = hay.slice(Math.max(0, start - 1), start);

    if (/[£$€]/.test(prefix)) continue;

    const value = parseNumericMagnitude(m[1]!, m[2]);

    if (value == null || value < 10) continue;

    if (isLikelyYearToken(value, hay, start, m[1]!, m[2])) continue;
    if (isPartialYearPrefix(hay, start, m[1]!)) continue;

    const tail = hay.slice(start + m[0].length, start + m[0].length + 48);

    const hints = [...(tail.match(NUMERIC_UNIT_HINT_RE) ?? [])].map((h) => h.toLowerCase());

    const uniqueHints = [...new Set(hints)];

    if (value >= 100 || m[2] || uniqueHints.length > 0) {

      targets.push({ value, hints: uniqueHints });

    }

  }



  const seen = new Set<number>();

  return targets.filter((t) => {

    if (seen.has(t.value)) return false;

    seen.add(t.value);

    return true;

  });

}



function parseLabelMagnitudes(label: string): number[] {

  const low = label.toLowerCase();

  const out: number[] = [];



  let m: RegExpExecArray | null;

  CURRENCY_AMOUNT_RE.lastIndex = 0;

  while ((m = CURRENCY_AMOUNT_RE.exec(low)) !== null) {

    const v = parseNumericMagnitude(m[2]!, m[3]);

    if (v != null) out.push(v);

  }



  const abbrev = /\b(\d+(?:\.\d+)?)\s*([km])\b/gi;

  abbrev.lastIndex = 0;

  while ((m = abbrev.exec(low)) !== null) {

    const v = parseNumericMagnitude(m[1]!, m[2]!);

    if (v != null) out.push(v);

  }



  const plain = /\b(\d{1,3}(?:,\d{3})+|\d+)\b/g;

  plain.lastIndex = 0;

  while ((m = plain.exec(low)) !== null) {

    const raw = m[1]!;

    if (YEAR_LIKE_RE.test(raw.replace(/,/g, ""))) continue;

    const v = parseNumericMagnitude(raw);

    if (v != null) out.push(v);

  }

  return out;

}



function magnitudesMatch(target: number, labelValues: number[]): boolean {

  if (labelValues.length === 0) return false;

  return labelValues.some((v) => {

    if (v === target) return true;

    const ratio = target >= v ? target / v : v / target;

    return ratio <= 1.05;

  });

}



function labelHasAbbreviatedMagnitude(label: string, target: number): boolean {

  if (target < 1_000) return false;

  const low = label.toLowerCase();

  const k = target / 1_000;

  if (Number.isInteger(k) && new RegExp(`\\b${k}\\s*k\\b`).test(low)) return true;

  const millions = target / 1_000_000;

  if (Number.isInteger(millions) && new RegExp(`\\b${millions}\\s*m\\b`).test(low)) return true;

  return false;

}



function labelSatisfiesHints(

  labelLow: string,

  hints: string[],

  currency?: string,

): boolean {

  if (hints.length === 0) return true;

  if (hints.some((h) => labelLow.includes(h))) return true;

  if (currency && labelLow.includes(currency)) return true;

  return false;

}



export function labelPreservesNumericSalience(

  label: string,

  title: string,

  description?: string | null,

): boolean {

  const targets = extractNumericTargets(title, description);

  if (targets.length === 0) return true;

  const labelValues = parseLabelMagnitudes(label);

  const low = label.toLowerCase();



  for (const { value, hints, currency } of targets) {

    const hasMagnitude =

      magnitudesMatch(value, labelValues) || labelHasAbbreviatedMagnitude(label, value);

    if (!hasMagnitude) return false;

    if (!labelSatisfiesHints(low, hints, currency)) return false;

  }

  return true;

}



function matchPatterns(hay: string): string[] {

  const out: string[] = [];

  for (const re of SALIENT_PHRASE_PATTERNS) {

    const m = hay.match(re);

    if (m?.[0]) out.push(m[0].trim().toLowerCase());

  }

  return out;

}



function isSignificantBigram(a: string, b: string): boolean {

  const ga = GENERIC_WORDS.has(a);

  const gb = GENERIC_WORDS.has(b);

  if (!ga && !gb) return true;

  if (ga && gb) return false;

  return (ga ? b : a).length >= 5;

}



const DEADLINE_FRAGMENT_RE =

  /\b(?:by|in)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/;



function isJunkPhrase(phrase: string): boolean {

  if (DEADLINE_FRAGMENT_RE.test(phrase)) return true;

  const words = phrase.split(/\s+/);

  if (words.some((w) => YEAR_LIKE_RE.test(w))) return true;

  return false;

}



/** 2–3 word phrases from the title that carry specificity (e.g. joint property). */

function significantPhrasesFromTitle(title: string): string[] {

  const words =

    title

      .toLowerCase()

      .match(/\b[\p{L}][\p{L}'’-]*\b/gu) ?? [];

  const phrases: string[] = [];

  for (let n = 2; n <= 3; n += 1) {

    for (let i = 0; i <= words.length - n; i += 1) {

      const slice = words.slice(i, i + n);

      if (n === 2 && !isSignificantBigram(slice[0]!, slice[1]!)) continue;

      if (n === 3) {

        const sigCount = slice.filter((w) => !GENERIC_WORDS.has(w)).length;

        if (sigCount < 2) continue;

      }

      const phrase = slice.join(" ");

      if (phrase.length >= 7 && !isJunkPhrase(phrase)) phrases.push(phrase);

    }

  }

  return phrases;

}



function distinctiveWordsInPhrase(phrase: string): string[] {

  return phrase

    .split(/\s+/)

    .filter(
      (w) =>
        !GENERIC_WORDS.has(w) &&
        !YEAR_LIKE_RE.test(w) &&
        (w.length >= 4 || SHORT_SALIENT_WORDS.has(w)),
    );

}



/** Label contains the phrase or enough of its distinctive words (for shortened currency labels). */

function phraseMatchesLabel(phrase: string, labelLow: string): boolean {

  if (labelLow.includes(phrase)) return true;

  const distinctive = distinctiveWordsInPhrase(phrase);

  if (distinctive.length === 0) return false;

  const hits = distinctive.filter((w) => labelLow.includes(w));

  return hits.length >= Math.ceil(distinctive.length / 2);

}



/**

 * Phrases a canvas label should preserve when they appear in the source goal.

 * Used to reject oversimplified AI labels (e.g. dropping "shared ownership").

 */

export function extractSalientPhrases(title: string, description?: string | null): string[] {

  const hay = normalizeHaystack(title, description);

  const fromPatterns = matchPatterns(hay);

  const fromTitle = significantPhrasesFromTitle(title.trim());

  return [...new Set([...fromPatterns, ...fromTitle])];

}



export function labelPreservesSalience(

  label: string,

  title: string,

  description?: string | null,

): boolean {

  if (!labelPreservesNumericSalience(label, title, description)) return false;

  const salient = extractSalientPhrases(title, description);

  if (salient.length === 0) return true;

  const low = label.toLowerCase();

  return salient.some((phrase) => phraseMatchesLabel(phrase, low));

}

