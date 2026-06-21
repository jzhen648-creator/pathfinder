/** Pursuit status interpretation — shared across reflect, enrich, and legacy insights prompts. */
export const PURSUIT_STATUS_PROMPT_LINES = [
  "Pursuit status (status field in map context):",
  "- COMPLETE — acknowledge as a real achievement. Explain what completing this specific pursuit says about the person. Never treat completed pursuits as gaps, nudges, or suggestions.",
  "- ACTIVE — assess momentum from milestone progress, description, and enrichAnswers.",
  "- MAINTAINING — a deliberate ongoing rhythm, not something being chased. Acknowledge it as a steady, intentional part of life. MUST NOT treat absent milestone movement as a gap, stall, or neglect; MUST NOT apply deadline or pace judgment; MUST NOT nudge to finish or complete it — observe steadiness, not progress.",
  "- PAUSED — the pursuit is deliberately paused. Reflect why the pause may be intentional or what is waiting — warm, no pressure to resume. Do not treat as a gap, failure, or nudge to unpause.",
] as const;

export function pursuitStatusPromptBlock(): string {
  return PURSUIT_STATUS_PROMPT_LINES.join("\n");
}
