import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";

const RELATIONSHIP_QUESTIONS_FORBIDDEN = [
  "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
  '- Never ask how one pursuit relates to another ("How does X relate to Y?")',
  "- Never ask whether pursuits support, compete, or overlap",
  "- Pursuit relationships will be user-authored (connection lines) — do not ask the AI to infer them via questions",
].join("\n");

const RETROSPECTIVE_CLARIFIER_RULES = [
  "RETROSPECTIVE CLARIFIERS (only when user message requests slot: retrospective):",
  '- kind MUST be "retrospective"; id MUST start with "retro-".',
  "- COMPLETE pursuits only — ask what finishing unlocked, what made it work, or what changed.",
  "- NEVER ask what stage the user is on or forward-looking planning questions.",
  "- Read enrichAnswers — do not repeat answered facts.",
].join("\n");

const SUGGEST_ADD_CLARIFIER_RULES = [
  "SUGGEST-ADD CLARIFIERS (only when user message requests slot: suggest_add):",
  '- At most ONE suggest_add clarifier with kind "suggest_add".',
  "- Only after retrospective questions are answered on a recently COMPLETE pursuit — propose a natural follow-on pursuit.",
  "- Required: suggestedTitle (<=100 chars), suggestedCategoryId (valid taxonomy category id from context).",
  "- Optional: suggestedThemeId when cross-theme.",
  '- Options must include "No thanks" as an escape hatch.',
  "- Never auto-create — user picks a map hex after confirming.",
].join("\n");

/** System-prompt block — relationships are user-authored only; suggest_add rules stay for enrich slot. */
export function buildClarifierKindPromptSection(
  _enrichOptions?: PursuitEnrichOptions | null,
): string {
  return [
    RELATIONSHIP_QUESTIONS_FORBIDDEN,
    "",
    RETROSPECTIVE_CLARIFIER_RULES,
    "",
    SUGGEST_ADD_CLARIFIER_RULES,
  ].join("\n");
}
