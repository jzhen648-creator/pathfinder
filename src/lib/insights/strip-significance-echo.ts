const SIGNIFICANCE_ECHO_PATTERNS = [
  /\bsignificance\s*(?:of|is|at|as|[:=])\s*[1-3](?:\s*\/\s*3)?\b/gi,
  /\b[1-3]\s*\/\s*3\s*(?:significance|priority)\b/gi,
  /\b(?:at|with|a)\s+[1-3]\s*\/\s*3(?:\s+(?:significance|priority))?\b/gi,
  /\b[1-3]\s*out\s*of\s*3\b/gi,
  /\b(?:rated|scored|marked)\s+[1-3]\s*(?:\/\s*3|out\s*of\s*3)\b/gi,
  /\b[1-3]\s*\/\s*3\b/gi,
  /\bsignificance\s*(?:of|is|at|as|[:=])\s*[1-5](?:\s*\/\s*5)?\b/gi,
  /\b[1-5]\s*\/\s*5\s*(?:significance|priority)\b/gi,
  /\b(?:at|with|a)\s+[1-5]\s*\/\s*5(?:\s+(?:significance|priority))?\b/gi,
  /\b[1-5]\s*out\s*of\s*(?:5|ten)\b/gi,
  /\b(?:rated|scored|marked)\s+[1-5]\s*(?:\/\s*5|out\s*of\s*(?:5|ten))\b/gi,
  /\b[1-5]\s*\/\s*5\b/gi,
];

function tidyAfterRemoval(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+at\s+(?=for\b)/gi, " ")
    .replace(/\b(?:rated|scored|marked)\s+(?=for\b)/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Remove AI echoes of the chapter significance score from reading prose. */
export function stripSignificanceEcho(text: string): string {
  if (!text.trim()) return "";

  let next = text;
  for (const pattern of SIGNIFICANCE_ECHO_PATTERNS) {
    next = next.replace(pattern, "");
  }
  return tidyAfterRemoval(next);
}
