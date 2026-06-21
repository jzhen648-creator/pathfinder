/** Shared theme-level insight field jobs for reflect + generate-insights prompts. */

export const THEME_INSIGHT_NON_DUPLICATION = [
  "THEME NON-DUPLICATION:",
  "- oneLiner = one-sentence theme verdict; reflective = supporting map facts the headline did not state.",
  "- Do not repeat the same idea across oneLiner, reflective, contextual, and combined.",
  "- Ban meta UI copy: never \"confirmed relationships on your map\", \"your map shows\", or \"the app sees\".",
].join("\n");

export const THEME_INSIGHT_FIELD_JOBS = [
  "THEME INSIGHTS (macro synthesis — not per-pursuit narrative):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective, contextual?, combined? }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 100 chars — theme-level verdict on balance, bottlenecks, or resource friction across pursuits in this theme.",
  "",
  "  reflective (UI: FROM YOUR MAP — endogenous map facts only):",
  "  - Statuses, deadlines, completions, and within-theme tensions between pursuits (<= 500 chars).",
  "  - Name specific pursuits when data supports it; do not inventory every row.",
  "  - Do NOT cite confirmedRelationships or user link labels here.",
  "  - Do NOT use population benchmarks, percentiles, or editorial career narratives (\"deliberate pivot\").",
  "",
  "  combined (UI: ACROSS PURSUITS — user-confirmed links only):",
  "  - ONLY when reading_packet confirmedRelationships lists links touching pursuits in this dirty theme.",
  "  - Cite pursuit titles VERBATIM and the user's relationship label; at most one link cluster (<= 500 chars).",
  "  - Do NOT paraphrase reflective or repeat map facts already in reflective/oneLiner.",
  "  - If no confirmed link touches this theme, combined MUST be an empty string.",
  "",
  "  contextual (UI: COMPARISON — exogenous population benchmarks for the theme):",
  "  - Theme-level evaluation: how pursuits in this theme compare to typical norms for someone of the user's age/location.",
  "  - Use ONLY: pursuit quantified fields (targetAmount, currentAmount, unit, deadline), answered enrichAnswers on theme pursuits, user age/location, and numbers from <benchmark_facts> in the user message.",
  "  - Do NOT invent statistics, percentiles, or rankings not in <benchmark_facts>.",
  "  - Do NOT repeat pursuit-panel comparison lines verbatim; synthesize at theme level when multiple pursuits share a theme.",
  "  - Do NOT write editorial observations (\"suggests a pivot\", \"shows commitment\") — benchmarks only.",
  "  - If <benchmark_facts> is absent, age AND location are both unknown, or nothing is benchmarkable, contextual MUST be \"\".",
  "  - When <benchmark_facts> covers this theme and pursuits have quantified fields, deadlines, or milestones, contextual SHOULD cite one concrete benchmark.",
  "",
  THEME_INSIGHT_NON_DUPLICATION,
  "  Do not repeat pursuit-panel execution copy in theme insights — pursuit sheets own per-pursuit velocity.",
  "  Only include themes listed in <dirty_themes>. Skip themes with no pursuits.",
].join("\n");

export const HOLISTIC_BENCHMARK_THEME_CONTEXTUAL_RULE = [
  "HOLISTIC BENCHMARK GATE:",
  "- When the user message says holisticBenchmarkEligible is false, every theme contextual field MUST be an empty string.",
].join("\n");

export const PURSUIT_COMPARISON_FIELD_JOBS = [
  "PURSUIT comparison field (UI label: Comparison):",
  "- Population / typical-norm benchmark for THIS pursuit only — not map-fact restatement (use fromMap for map facts).",
  "- Use pursuit quantified fields, answered enrichAnswers, user age/location, and <benchmark_facts> when present in the user message.",
  "- When <benchmark_facts> is present and this pursuit has quantified targets, a deadline, milestones, or enrichAnswers, include comparison unless no defensible benchmark exists.",
  "- Do NOT invent statistics not in <benchmark_facts>. Omit comparison only when no defensible benchmark.",
  "- Do NOT write editorial career narratives or vague filler.",
  "- At most one benchmark observation per pursuit.",
].join("\n");
