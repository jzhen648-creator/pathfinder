function capitalizeItAfterBoundaries(text: string): string {
  return text.replace(/(^|[.!?]\s+)it\b/g, (_match, prefix: string) => `${prefix}It`);
}

function tidyAfterRemoval(text: string): string {
  return capitalizeItAfterBoundaries(
    text
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/^\s*,\s*/g, "")
      .trim(),
  );
}

/** Remove AI filler uses of "chapter" as a meta noun from reading prose. */
export function stripChapterEcho(text: string): string {
  if (!text.trim()) return "";

  let next = text;

  next = next.replace(
    /\b(?:this|that)\s+(?:active|pivotal|completed|paused|inactive|current|ongoing)\s+chapter\s*,\s*/gi,
    "",
  );

  next = next.replace(
    /\b(?:this|that)\s+(?:(?:active|pivotal|completed|paused|inactive|current|ongoing)\s+)?chapter\b(?=\s+(?:is|sits|has|was|were|started|follows|depends|competes|aligns|shares|runs|remains|continues|extends|opened|opens|carries|anchors|feeds|ties|tied)\b)/gi,
    "it",
  );

  next = next.replace(/\b(?:this|that)\s+(?:(?:active|pivotal|completed|paused|inactive|current|ongoing)\s+)?chapter\s*,/gi, "it,");

  next = next.replace(
    /\b(the|this|that|a|an)\s+((?:[\w£$€'&./-]+\s+){0,8}[\w£$€'&./-]+)\s+chapter\b/gi,
    (_match, article: string, title: string) => `${article} ${title.trim()}`,
  );

  next = next.replace(/\b(?:active|pivotal|completed|paused|inactive|current|ongoing)\s+chapter\b/gi, "");

  return tidyAfterRemoval(next);
}
