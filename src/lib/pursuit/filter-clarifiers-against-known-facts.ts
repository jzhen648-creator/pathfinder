import type { Clarifier, EnrichAnswer } from "@/lib/pursuit/pursuit-enrich-types";

const PROSE_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "has",
  "have",
  "had",
  "your",
  "this",
  "that",
  "with",
  "from",
  "into",
  "what",
  "how",
  "when",
  "where",
  "which",
  "who",
  "why",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "about",
  "current",
]);

function significantProseTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9£]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !PROSE_STOP_WORDS.has(token));
}

function backgroundFactLines(background?: string | null): string[] {
  if (!background?.trim()) return [];
  return background
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function knownFactStrings(input: {
  background?: string | null;
  enrichAnswers: EnrichAnswer[];
}): string[] {
  const facts = backgroundFactLines(input.background);
  for (const answer of input.enrichAnswers) {
    const option = answer.selectedOption.trim();
    if (option) facts.push(option);
  }
  return facts;
}

/** True when text token-overlaps a known fact (same heuristic as sentenceRestatesEnrichAnswer). */
export function textRestatesKnownFact(text: string, fact: string): boolean {
  const textTokens = significantProseTokens(text);
  if (textTokens.length === 0) return false;

  const factTokens = significantProseTokens(fact);
  if (factTokens.length === 0) return false;

  const matched = factTokens.filter((token) => textTokens.includes(token));
  if (matched.length >= Math.min(2, factTokens.length)) return true;
  if (matched.length / factTokens.length >= 0.6) return true;
  return false;
}

function clarifierCandidateText(clarifier: Clarifier): string {
  return [clarifier.prompt, ...clarifier.options].join(" ");
}

function clarifierRestatesKnownFact(clarifier: Clarifier, facts: string[]): boolean {
  const candidate = clarifierCandidateText(clarifier);
  return facts.some((fact) => textRestatesKnownFact(candidate, fact));
}

/** Drop clarifiers whose prompt/options overlap background lines or enrichAnswers. */
export function filterClarifiersAgainstKnownFacts(
  clarifiers: Clarifier[],
  knownFacts: { background?: string | null; enrichAnswers: EnrichAnswer[] },
): Clarifier[] {
  const facts = knownFactStrings(knownFacts);
  if (facts.length === 0) return clarifiers;

  return clarifiers.filter((clarifier) => !clarifierRestatesKnownFact(clarifier, facts));
}
