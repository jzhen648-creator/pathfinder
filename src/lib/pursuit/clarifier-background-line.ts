/** Line shape mirrored into Goal.background when a quick question is answered. */
export function clarifierAppendLine(prompt: string, selectedOption: string): string {
  return `${prompt} → ${selectedOption}`;
}

function backgroundLines(background: string | null | undefined): string[] {
  if (!background?.trim()) return [];
  return background
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function joinBackgroundLines(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return lines.join("\n");
}

/** Remove one exact append line from background prose (trimmed line match). */
export function removeClarifierAppendLineFromBackground(
  background: string | null | undefined,
  prompt: string,
  selectedOption: string,
): string | null {
  const target = clarifierAppendLine(prompt, selectedOption).trim();
  const kept = backgroundLines(background).filter((line) => line !== target);
  return joinBackgroundLines(kept);
}

/** Replace or append a clarifier mirror line in Goal.background. */
export function syncClarifierAnswerInBackground(
  background: string | null | undefined,
  input: { prompt: string; selectedOption: string },
  previousAnswer?: { prompt: string; selectedOption: string } | null,
): string | null {
  let lines = backgroundLines(background);

  if (previousAnswer) {
    const oldLine = clarifierAppendLine(previousAnswer.prompt, previousAnswer.selectedOption).trim();
    lines = lines.filter((line) => line !== oldLine);
  }

  const newLine = clarifierAppendLine(input.prompt, input.selectedOption).trim();
  if (!lines.includes(newLine)) {
    lines = [...lines, newLine];
  }

  return joinBackgroundLines(lines);
}
