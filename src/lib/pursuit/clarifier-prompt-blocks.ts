/** Shared quick-question prompt rules for reflect + pursuit enrich + create. */

export const CLARIFIER_BATCH_MAX = 3;

export const CLARIFIER_MILESTONE_GROUNDING = [
  "MILESTONE GROUNDING (mandatory — read pursuit milestones in map context first):",
  "- Never ask a question whose answer is already established by a completed milestone (`completed: true`) or a structured field (`currentAmount`, `targetAmount`).",
  "- Never offer an answer option that contradicts a completed milestone.",
  '- Wrong: milestone "5k without stopping" is complete, but options include "Under 5k" for a running-distance question.',
  '- Right: ask about the next frontier — e.g. "Where are you on the jump to 10k?" with options like "Still building toward 10k" / "10k done, half-marathon next" / "Not sure yet".',
  "- Prefer questions about what is NOT yet captured — the next unknown, not what the map already proves.",
  "- If every plausible question is already answered by milestones, structured fields, or enrichAnswers, return an empty clarifiers array.",
].join("\n");

export const CLARIFIER_GENERATION_PRINCIPLE = [
  "GENERATION PRINCIPLE (works for ANY pursuit — rental property, relationship goal, car, qualification, anything):",
  "Reason from world knowledge about THIS pursuit's title, theme, status, milestones, description, and enrichAnswers.",
  "Ask the single highest-value missing fact that would most change how this pursuit should be read.",
  "Do NOT pattern-match a fixed catalog of example domains — the examples below illustrate the MOVE only.",
  "",
  "Move — find the decisive unknown:",
  "- For a quantified target: ask the fact that grounds pace or feasibility (rate, contribution, baseline, constraint).",
  "- For an asset or purchase: ask what changes valuation, timeline, or risk (condition, financing, location — whatever domain experts would ask).",
  "- For COMPLETE / retrospective mode: ask what finishing unlocked, what made it work, or what changed — never what stage they are on.",
  "",
  "Illustration (the move, not a topic list) — rental property vs running:",
  '- Rental ("Buy rental property"): "What\'s the target yield or monthly rent you\'re underwriting?" — grounds the investment case.',
  '- Running when 5k is already complete on the map: Wrong — "What\'s your longest run?" with "Under 5k". Right — "Where are you on the jump to 10k?"',
].join("\n");

export const CLARIFIER_STOP_AND_CADENCE_RULES = [
  "STOP / CADENCE:",
  `- Return up to ${CLARIFIER_BATCH_MAX} clarifiers per pursuit per sync, ordered highest-value first — the UI reveals one at a time.`,
  "- Return an empty array when no high-value gap remains — do not barrel-scrape (no colour-of-car trivia when essentials are covered).",
  "- Scale how many you offer by significance (1–5 in map context): significance 4–5 → up to 3; 3 → up to 2; 1–2 → 1–2 then prefer [].",
  "- Read enrichAnswers in map context — never repeat what is already answered; build on prior answers and go deeper.",
  "- Never ask about relationships between pursuits (see RELATIONSHIP QUESTIONS rule).",
  '- Never ask the user to evaluate motivation or commitment ("How important is this?") — significance already covers that.',
  "",
  "CONCRETE ANSWERS ONLY:",
  "- Each question needs a concrete answer (fact, number, yes/no band) — not open reflection (\"How do you feel about this?\").",
  "- 3–4 specific, plausible options — not generic \"Yes / No / Not sure / Other\".",
  "- Options must be consistent with completed milestones and enrichAnswers.",
  "",
  "Title-disambiguation is allowed when the title alone is genuinely ambiguous — contextual questions are additional, not a replacement.",
].join("\n");

export const CONTEXTUAL_QUICK_QUESTIONS = [
  "CONTEXTUAL QUICK QUESTIONS:",
  CLARIFIER_GENERATION_PRINCIPLE,
  "",
  CLARIFIER_MILESTONE_GROUNDING,
  "",
  CLARIFIER_STOP_AND_CADENCE_RULES,
].join("\n");

/** System-prompt OUTPUT lines shared by reflect + enrich (single source — do not duplicate). */
export function buildClarifierSystemOutputLines(): string[] {
  return [
    `- clarifiers: 0-${CLARIFIER_BATCH_MAX} multiple-choice questions per pursuit when the user message requests a quick-question slot.`,
    "  Each clarifier: id (short slug), prompt, options (3-4 specific labels), optional kind.",
    "  Kinds: clarify (default forward-looking), retrospective (COMPLETE pursuits — what finishing unlocked), suggest_add (follow-on pursuit — only when user message requests that slot).",
    "  Return [] when no high-value gap remains — significance scales count; never barrel-scrape.",
    CONTEXTUAL_QUICK_QUESTIONS,
  ];
}

export const CREATE_CLARIFIER_MILESTONE_GROUNDING = [
  "MILESTONE GROUNDING:",
  "- If completed milestones are provided in context, never ask what they already prove and never offer contradicting options.",
  '- Wrong: "5k without stopping" complete but options include "Under 5k".',
  "- Prefer the next frontier the map does not yet capture.",
  "- If the title implies prior progress (e.g. returning to a goal), do not ask beginner baseline questions — ask what changed or what is next.",
].join("\n");

/** Create-time suggest (Build here) — one optional question; shares generation principle. */
export function buildCreateClarifierSystemPrompt(): string {
  return [
    "You suggest ONE optional quick question for someone creating a new pursuit on their life map.",
    'Return ONLY valid JSON: { "clarifier": { "id": string, "prompt": string, "options": string[], "kind"?: "clarify"|"retrospective" } | null }.',
    "",
    CREATE_CLARIFIER_MILESTONE_GROUNDING,
    "",
    CLARIFIER_GENERATION_PRINCIPLE,
    "",
    "When to return null:",
    "- Title is already fully specific (amount, deadline, and outcome all clear)",
    "- No high-value fact would meaningfully change how this pursuit should be read",
    "- Milestones or enrichAnswers already answer every plausible question",
    "",
    "When to return a clarifier:",
    "- Ask the single highest-value missing fact for THIS pursuit",
    "- Title-disambiguation is allowed when the title alone is ambiguous",
    '- When status is COMPLETE: kind "retrospective" — what finishing meant, what it unlocked, or what made it work — NOT what stage the user is on',
    "",
    "RULES:",
    "- Exactly 0 or 1 clarifier",
    "- 3–4 specific, plausible answer options",
    "- Concrete answers only — not open reflection",
    "- NEVER ask how one pursuit relates to another",
    "- NEVER ask the user to evaluate their motivation or commitment",
    "",
    "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
    '- Never ask how one pursuit relates to another ("How does X relate to Y?")',
    "- Never ask whether pursuits support, compete, or overlap",
  ].join("\n");
}
