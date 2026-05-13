/** Trim whitespace and capitalise the first character; otherwise unchanged (no punctuation added). */
export function formatUserInput(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";
  const first = trimmed[0]!;
  return first.toLocaleUpperCase() + trimmed.slice(1);
}
