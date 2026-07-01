/** Shared quick-question prompt rules for reflect + pursuit enrich + create. */

/** Max pending quick questions visible in Context at once. */
export const CLARIFIER_PENDING_CAP = 6;

/** First generation batch after create or empty queue. */
export const CLARIFIER_INITIAL_BATCH = 6;

/** Replacement batch after user dismisses all pending cards. */
export const CLARIFIER_REPLENISH_BATCH = 3;

/** @deprecated Use CLARIFIER_INITIAL_BATCH or CLARIFIER_REPLENISH_BATCH. */
export const CLARIFIER_BATCH_MAX = CLARIFIER_INITIAL_BATCH;

/** Max skipped prompt strings remembered per chapter (anti-repeat wording only). */
export const CLARIFIER_SKIPPED_PROMPTS_MAX = 10;

export const CLARIFIER_DURABLE_CONTEXT = [
  "DURABLE CONTEXT (prefer over progress stage):",
  "Quick questions capture facts that still matter months later — target type, route, constraint, preference, funding approach, role type, support model, risk factor.",
  "Milestones own progress and stage. Do NOT ask where the user is in the process when milestones can represent that movement.",
  'Avoid: "Where are you in the job search?" / "What stage are you at?" / "Have you applied yet?" / "Just started collecting docs?" — those answers go stale.',
  'Prefer: "What model era are you targeting?" / "What visa route?" / "Independent broker or employed?" / "Cash savings or financing?"',
].join("\n");

export const CLARIFIER_MILESTONE_GROUNDING = [
  "MILESTONE GROUNDING (mandatory — read chapter milestones in map context first):",
  "- Never ask a question whose answer is already established by a completed milestone (`completed: true`) or a structured field (`currentAmount`, `targetAmount`).",
  "- Never offer an answer option that contradicts a completed milestone.",
  '- Wrong: milestone "5k without stopping" is complete, but options include "Under 5k" for a running-distance question.',
  '- Wrong: "Where are you in the job search?" when milestones can track application and interview steps.',
  "- Prefer durable interpretation context (see DURABLE CONTEXT) over progress-stage snapshots.",
  "- Prefer questions about what is NOT yet captured — the next unknown, not what the map already proves.",
  "- If every plausible question is already answered by milestones, structured fields, background, or enrichAnswers, return an empty clarifiers array.",
].join("\n");

export const CLARIFIER_GENERATION_PRINCIPLE = [
  "GENERATION PRINCIPLE (works for ANY chapter — rental property, relationship goal, car, qualification, anything):",
  "Reason from world knowledge about THIS chapter's title, theme, status, milestones, background, and enrichAnswers.",
  "Ask the single highest-value missing fact that would most change how this chapter should be read.",
  "Do NOT pattern-match a fixed catalog of example domains — the examples below illustrate the MOVE only.",
  "",
  "Move — find the decisive unknown:",
  "- For a quantified target: ask the fact that grounds pace or feasibility (rate, contribution, baseline, constraint).",
  "- For an asset or purchase: ask what changes valuation, timeline, or risk (condition, financing, location — whatever domain experts would ask).",
  "- For COMPLETE / retrospective mode: ask what finishing unlocked, what made it work, or what changed — never what stage they are on.",
  "",
  "Illustration (the move, not a topic list) — rental property vs running:",
  '- Rental ("Buy rental property"): "What\'s the target yield or monthly rent you\'re underwriting?" — grounds the investment case.',
  '- Running when 5k is already complete on the map: Wrong — "What\'s your longest run?" with "Under 5k". Right — ask a durable constraint ("How many days per week can you train?") or let milestones track distance progress.',
].join("\n");

export const CLARIFIER_BENCHMARK_STEER = [
  "BENCHMARK-ENABLING FACTS (prefer when map lacks age, location, or quantified targets):",
  "- Ask facts that unlock population comparison later — contribution rate, salary band, qualification level, training frequency, visa route, financing approach.",
  "- Prefer durable interpretation context over progress-stage snapshots (milestones own stage).",
].join("\n");

export const CLARIFIER_STOP_AND_CADENCE_RULES = [
  "STOP / CADENCE:",
    `- Initial batch: up to ${CLARIFIER_INITIAL_BATCH} clarifiers per chapter, ordered highest-value first — all shown in Context.`,
  `- Replenishment batch (after user skipped pending cards): up to ${CLARIFIER_REPLENISH_BATCH} new clarifiers.`,
  "- Return an empty array when no high-value gap remains — do not barrel-scrape.",
  "- When enrichAnswers or milestones already cover the decisive facts, return [].",
  `- Scale initial batch by significance (1–5): 4–5 → up to ${CLARIFIER_INITIAL_BATCH}; 3 → up to 4; 1–2 → up to 2 then prefer [].`,
  "- Read enrichAnswers in map context — never repeat what is already answered; build on prior answers.",
  "- Never ask about relationships between chapters (see RELATIONSHIP QUESTIONS rule).",
  '- Never ask the user to evaluate motivation or commitment ("How important is this?") — significance already covers that.',
  "",
  "CONCRETE ANSWERS ONLY:",
  "- Each question needs a concrete answer (fact, number, yes/no band) — not open reflection (\"How do you feel about this?\").",
  "- 3–4 specific, plausible options — not generic \"Yes / No / Not sure / Other\".",
  "- Options must be consistent with completed milestones and enrichAnswers.",
  "",
  "Title-disambiguation is allowed when the title alone is genuinely ambiguous — contextual questions are additional, not a replacement.",
].join("\n");

export const PURSUIT_PANEL_CONTEXT_PRECEDENCE = [
  "CHAPTER CONTEXT PRECEDENCE (headline/body/comparison):",
  "Milestones, status, and structured fields (deadline, amount) are the source of truth for current progress and stage.",
  "enrichAnswers are durable interpretation context — target type, route, constraint, preference, funding approach, support model.",
  'If an enrichAnswer describes a progress stage (e.g. "just started", "not yet applied") and milestones or status show later movement, milestones/status supersede the answer.',
  "Never repeat a stale progress-stage enrichAnswer as current truth in headline, body, or comparison.",
].join("\n");

/** Clarifies that milestone visibility rules apply to prose only, not the suggestedMilestones field. */
export const PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD = [
  "CHAPTER PANEL — suggestedMilestones FIELD (separate from headline/body):",
  "When <milestone_options> says Milestones allowed, you MUST return 1-6 items in suggestedMilestones — do not omit the array.",
  "The milestone-list visibility rules above apply to headline/body/comparison only — not to suggestedMilestones.",
  "Outcome waypoints the user taps to accept (e.g. \"CeMAP Module 1 passed\", \"First application submitted\") — NOT tasks (\"Update CV\", \"Research firms\").",
];

/** Shared suggestedMilestones output contract for reflect + enrich. */
export const SUGGESTED_MILESTONES_OUTPUT_LINES = [
  "- suggestedMilestones: when user message says milestones are allowed, MUST return 1-6 chronological outcome waypoints; otherwise null.",
  "  Each item: { title: string, order: 0-based integer } — order is required.",
  "  Existing milestones on the map are facts — do not duplicate their titles. Proposing new waypoints in suggestedMilestones is allowed.",
  "  When milestones already exist on the map, suggest only missing steps from the current frontier to the deadline.",
];

/** Suggested successor pursuits — retired; map placement + status carry succession. */
export const SUGGESTED_CONTINUATIONS_OUTPUT_LINES: string[] = [];

export const CONTEXTUAL_QUICK_QUESTIONS = [
  "CONTEXTUAL QUICK QUESTIONS:",
  CLARIFIER_GENERATION_PRINCIPLE,
  "",
  CLARIFIER_BENCHMARK_STEER,
  "",
  CLARIFIER_DURABLE_CONTEXT,
  "",
  CLARIFIER_MILESTONE_GROUNDING,
  "",
  CLARIFIER_STOP_AND_CADENCE_RULES,
].join("\n");

/** System-prompt OUTPUT lines shared by reflect + enrich (single source — do not duplicate). */
export function buildClarifierSystemOutputLines(): string[] {
  return [
    `- clarifiers: 0-${CLARIFIER_INITIAL_BATCH} multiple-choice questions per chapter when the user message requests a quick-question slot.`,
    "  Each clarifier: id (short slug), prompt, options (3-4 specific labels), optional kind.",
    "  Kinds: clarify (default forward-looking), retrospective (COMPLETE chapters — what finishing unlocked).",
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
    "You suggest ONE optional quick question for someone creating a new chapter on their life map.",
    'Return ONLY valid JSON: { "clarifier": { "id": string, "prompt": string, "options": string[], "kind"?: "clarify"|"retrospective" } | null }.',
    "",
    CREATE_CLARIFIER_MILESTONE_GROUNDING,
    "",
    CLARIFIER_GENERATION_PRINCIPLE,
    "",
    "When to return null:",
    "- Title is already fully specific (amount, deadline, and outcome all clear)",
    "- No high-value fact would meaningfully change how this chapter should be read",
    "- Milestones or enrichAnswers already answer every plausible question",
    "",
    "When to return a clarifier:",
    "- Ask the single highest-value missing fact for THIS chapter",
    "- Title-disambiguation is allowed when the title alone is ambiguous",
    '- When status is COMPLETE: kind "retrospective" — what finishing meant, what it unlocked, or what made it work — NOT what stage the user is on',
    "",
    "RULES:",
    "- Exactly 0 or 1 clarifier",
    "- 3–4 specific, plausible answer options",
    "- Concrete answers only — not open reflection",
    "- NEVER ask how one chapter relates to another",
    "- NEVER ask the user to evaluate their motivation or commitment",
    "",
    "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
    '- Never ask how one chapter relates to another ("How does X relate to Y?")',
    "- Never ask whether chapters support, compete, or overlap",
  ].join("\n");
}
