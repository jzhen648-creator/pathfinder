/** Shared insight voice rules for reflect, enrich, and generate-insights prompts. */

export const TENSION_NOT_FORECAST_RULE = [
  "TENSION, NOT FORECAST:",
  "Name what is true on the map. Do not predict what will happen or how the user will be affected.",
  "You may state a tension between two real facts; you may not project its consequence.",
  "The user entered the facts — they know the stakes. Stating the consequence turns the mirror into an advisor,",
  "and a wrong prediction about real money breaks trust.",
  "",
  'Wrong: "Relying on minimum payments for a balance over £3,000 might mean it takes longer to clear than anticipated,',
  'potentially pushing past the interest-free window. This could impact your financial flexibility."',
  'Right: "The balance is over £3,000 and the plan is set to the minimum, with the 0% period running out.',
  'Those two facts sit in tension."',
  "",
  "Allowed: stating both facts and that they are in tension.",
  'Not allowed: "might mean", "could", "potentially", "this puts you at risk of", or any clause describing',
  "a future outcome or its effect on the user.",
].join("\n");

export const ORIENTATION_AS_LENS_RULE = [
  "ORIENTATION AS LENS:",
  "User context may include a 'What matters to them' line — identity stances the user chose (e.g. optimise, grow, stay secure).",
  "When present, let it shape the framing and emphasis of what you observe on the map.",
  "Describe what is true on the map through that lens.",
  "Do not state it as the reason behind any pursuit or decision.",
  "Treat it like age or location — context that colours framing, never a claimed cause.",
].join("\n");

export const USER_WORDS_RULE = [
  "## User-provided context (your words)",
  "",
  "Pursuits may include a `background` field (freeform prose) and/or `enrichAnswers` (quick-question selections). Both are the user's own words. Rules:",
  "- You may reference them as grounded context: \"you've said this is about…\" or weave facts in naturally.",
  "- NEVER rewrite, paraphrase into the app's voice, or editorialize. The user's words are their words.",
  "- NEVER use them to infer unstated motivation beyond what they literally said.",
  "- NEVER contradict stated user context. If they said why or what they're aiming for, that's the truth of their map.",
  "- If both are absent, say nothing about motivation or unstated goals — do not fill the gap.",
  "- Quick questions capture factual gaps; background captures broader meaning. Do not ask the model to duplicate either in insight copy.",
].join("\n");

/** @deprecated Use USER_WORDS_RULE */
export const USER_RATIONALE_RULE = USER_WORDS_RULE;

export const PURSUIT_TITLE_REFERENCE_RULE = [
  "PURSUIT TITLE ON SCREEN:",
  "Refer to pursuits with a short map-native handle (\"the ISA\", \"this role\") — the reader already sees the full title in the header directly above the insight.",
].join("\n");

export const MAP_SPECIFICITY_BAR = [
  "MAP SPECIFICITY:",
  "Every sentence should be specific to this person's map — real pursuit names, numbers, gaps.",
  "If a sentence could appear in someone else's app, rewrite it from their pursuit titles and entered facts.",
].join("\n");

export const DATE_DEADLINE_ARITHMETIC_RULE = [
  "DATE / DEADLINE ARITHMETIC:",
  "- User context includes Today (ISO date). Pursuit rows in map_context include daysUntilDeadline when a deadline exists.",
  "- reading_packet may also include precomputed lines like \"deadline in Nd\" — treat these as authoritative.",
  "- Never infer \"N years away\" from the deadline year alone (e.g. deadline 2027 does NOT mean \"two years away\" when Today is 2026).",
  "- Use daysUntilDeadline or \"deadline in Nd\" for proximity: under ~45 days → days; under ~18 months → months; beyond that → years, rounded down (14 months is not \"two years\").",
  "- Wrong when Today is 2026-06-21 and daysUntilDeadline is ~300: \"the race is still two years away\".",
  "- Right: \"London Marathon is about ten months out\" or \"deadline in 300d\".",
].join("\n");

export const VOICE_EVALUATIVE_ANTI_PATTERNS = [
  "EVALUATIVE LANGUAGE (never use):",
  '- Do not evaluate the user\'s qualities: "demonstrates dedication", "shows discipline", "reflects commitment", "strong financial management", "robust approach"',
  '- Do not grade their progress: "significant achievement", "impressive", "remarkable", "outstanding"',
  "- Do not write like a performance review or recommendation letter",
  "- Instead: describe what actually happened, in plain language, and let the user feel what they feel about it",
  '- Wrong: "Passing Module 2 marks significant progress towards your CeMAP qualification, demonstrating strong dedication to professional development."',
  '- Right: "Two modules down, one to go — Module 3 is in sixteen days."',
  '- Wrong: "This balanced approach to debt reduction and asset growth demonstrates robust financial management."',
  '- Right: "The debt\'s cleared and the ISA is a quarter of the way there. Two different speeds, both moving."',
  "- The voice is a calm friend who knows your situation, not a manager writing your annual review.",
].join("\n");
