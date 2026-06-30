/** Pursuit status interpretation — shared across reflect, enrich, and legacy insights prompts. */
export const PURSUIT_STATUS_PROMPT_LINES = [
  "Pursuit status (status field in map context):",
  "- COMPLETE — the reader already sees Complete in the meta strip. Headline names what finishing changes or unlocks on the map (a sibling pursuit it feeds, a tension that clears, a frontier that opens) — not that the pursuit is done, and not character commentary about the person. Treat completed pursuits as settled facts, not gaps or nudges.",
  "- ACTIVE — assess momentum from milestone progress, description, and enrichAnswers.",
  "- MAINTAINING — a deliberate ongoing rhythm, not something being chased. Acknowledge it as a steady, intentional part of life. MUST NOT treat absent milestone movement as a gap, stall, or neglect; MUST NOT apply deadline or pace judgment; MUST NOT nudge to finish or complete it — observe steadiness, not progress.",
  "- PAUSED — the pursuit is deliberately paused. Reflect why the pause may be intentional or what is waiting — warm, no pressure to resume. Do not treat as a gap, failure, or nudge to unpause.",
] as const;

export function pursuitStatusPromptBlock(): string {
  return PURSUIT_STATUS_PROMPT_LINES.join("\n");
}
