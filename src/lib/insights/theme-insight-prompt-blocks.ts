/** Shared theme-level insight field jobs for reflect + generate-insights prompts. */

export const THEME_INSIGHT_NON_DUPLICATION = [
  "THEME NON-DUPLICATION:",
  "- oneLiner = one-sentence theme verdict; reflective = supporting map facts the headline did not state.",
  "- Each line adds new information: oneLiner names the theme bottleneck or what is carrying it; reflective holds map facts the headline did not state.",
  "- Ban meta UI copy: never \"confirmed relationships on your map\", \"your map shows\", or \"the app sees\".",
].join("\n");

export const THEME_INSIGHT_FIELD_JOBS = [
  "THEME INSIGHTS (macro synthesis — not per-pursuit narrative):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 100 chars — one short clause: what is carrying this theme or where the bottleneck sits (not a pursuit-by-pursuit summary).",
  "",
  "  reflective (UI: FROM YOUR MAP — endogenous map facts only):",
  "  - Statuses, deadlines, completions, and within-theme tensions between pursuits (<= 800 chars).",
  "  - Name specific pursuits when data supports it; do not inventory every row.",
  "  - Each sentence anchors to a pursuit title from map_context and a fact the user entered there — status, deadline, milestone completion, target amount, current amount, or enrichAnswer.",
  "  - Relate pursuits to each other within the theme using only those entered facts; if a sentence would read the same on another user's map, rewrite it from their pursuit titles and entries.",
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
