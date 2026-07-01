import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";

const RELATIONSHIP_QUESTIONS_FORBIDDEN = [
  "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
  '- Never ask how one chapter relates to another ("How does X relate to Y?")',
  "- Never ask whether chapters support, compete, or overlap",
  "- Chapter relationships will be user-authored (connection lines) — do not ask the AI to infer them via questions",
].join("\n");

const RETROSPECTIVE_CLARIFIER_RULES = [
  "RETROSPECTIVE CLARIFIERS (only when user message requests slot: retrospective):",
  '- kind MUST be "retrospective"; id MUST start with "retro-".',
  "- COMPLETE chapters only — ask what finishing unlocked, what made it work, or what changed.",
  "- NEVER ask what stage the user is on or forward-looking planning questions.",
  "- Read enrichAnswers — do not repeat answered facts.",
].join("\n");

/** System-prompt block — relationships are user-authored only. */
export function buildClarifierKindPromptSection(
  _enrichOptions?: PursuitEnrichOptions | null,
): string {
  return [RELATIONSHIP_QUESTIONS_FORBIDDEN, "", RETROSPECTIVE_CLARIFIER_RULES].join("\n");
}
