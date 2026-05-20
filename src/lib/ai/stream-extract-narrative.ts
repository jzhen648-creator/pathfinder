export const STREAM_NARRATIVE_MAX_WORDS = 20;

export const STREAM_NARRATIVE_SYSTEM_PROMPT = [
  "You are Pathfinder Stream listening to a brain dump before structured extraction.",
  `Reflect what you heard in one warm second-person sentence (${STREAM_NARRATIVE_MAX_WORDS} words max, hard limit).`,
  "Do not output JSON, bullet lists, or task lists unless the dump is empty of substance.",
  "Do not ask questions unless the dump is completely empty of substance.",
].join("\n");

export function buildStreamNarrativeUserMessage(scopeLabel: string, input: string): string {
  return [
    `Scope: ${scopeLabel}`,
    "",
    "Brain dump:",
    input.trim(),
    "",
    `Reply in one second-person sentence, at most ${STREAM_NARRATIVE_MAX_WORDS} words.`,
  ].join("\n");
}

/** Collapse whitespace and enforce word cap; prefer ending at the first sentence within the cap. */
export function truncateStreamNarrative(
  text: string,
  maxWords: number = STREAM_NARRATIVE_MAX_WORDS,
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const words = collapsed.split(/\s+/).filter(Boolean);
  const cappedText = words.slice(0, maxWords).join(" ");

  const firstSentence = cappedText.match(/^[\s\S]*?[.!?](?=\s|$)/);
  if (firstSentence) {
    return firstSentence[0].trim();
  }

  return cappedText;
}
