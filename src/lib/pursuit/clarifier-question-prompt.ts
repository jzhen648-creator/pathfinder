import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";

const RELATIONSHIP_QUESTIONS_FORBIDDEN = [
  "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
  '- Never ask how one pursuit relates to another ("How does X relate to Y?")',
  "- Never ask whether pursuits support, compete, or overlap",
  "- Pursuit relationships will be user-authored (connection lines) — do not ask the AI to infer them via questions",
].join("\n");

const CONNECT_CLARIFIER_RULES = [
  "CONNECT CLARIFIERS (only when user message requests kind: connect):",
  '- At most ONE connect clarifier with kind "connect".',
  "- peerGoalId MUST be a sibling pursuit id from scoped context JSON.",
  "- Prompt asks whether the two pursuits are related — user confirms; never prose-only in description.",
  '- Options: 3-4 labels including "Unrelated" or "Not sure".',
  "- Do not generate connect clarifiers when all siblings already have confirmed relationships.",
].join("\n");

const SUGGEST_ADD_CLARIFIER_RULES = [
  "SUGGEST-ADD CLARIFIERS (only when user message requests kind: suggest_add):",
  '- At most ONE suggest_add clarifier with kind "suggest_add".',
  "- Only for a pursuit recently marked COMPLETE — propose a natural follow-on pursuit.",
  "- Required: suggestedTitle (<=100 chars), suggestedCategoryId (valid taxonomy category id from context).",
  "- Optional: suggestedThemeId when cross-theme.",
  '- Options must include "No thanks" as an escape hatch.',
  "- Never auto-create — user picks a map hex after confirming.",
].join("\n");

/** System-prompt block for connect / suggest_add / forbidden relationship copy. */
export function buildClarifierKindPromptSection(
  enrichOptions?: PursuitEnrichOptions | null,
): string {
  const options = resolvePursuitEnrichOptions(enrichOptions);
  if (!options.suggestConnections) {
    return RELATIONSHIP_QUESTIONS_FORBIDDEN;
  }
  return [CONNECT_CLARIFIER_RULES, "", SUGGEST_ADD_CLARIFIER_RULES].join("\n");
}
