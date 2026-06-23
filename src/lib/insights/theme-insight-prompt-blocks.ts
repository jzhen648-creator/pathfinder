/** Shared theme-level insight field jobs for reflect + generate-insights prompts. */

export const THEME_INSIGHT_NON_DUPLICATION = [
  "THEME NON-DUPLICATION:",
  "- oneLiner = one complete theme headline sentence; reflective = supporting map facts the headline did not state.",
  "- Each line adds new information: oneLiner names the theme bottleneck or what is carrying it; reflective holds map facts the headline did not state.",
  "- Ban meta UI copy: never \"confirmed relationships on your map\", \"your map shows\", or \"the app sees\".",
].join("\n");

export const THEME_INSIGHT_FIELD_JOBS = [
  "THEME INSIGHTS (macro synthesis — not per-pursuit narrative):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 140 chars — one complete, self-contained thought (a full sentence, not a fragment);",
  "  must never trail off mid-phrase. Name what is carrying this theme or where the bottleneck sits",
  "  (not a pursuit-by-pursuit summary).",
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

export const THEME_REFLECT_OUTPUT_CONTRACT = [
  "THEME OUTPUT (reflect path — map-only):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective } only.',
  '- contextual and combined MUST be empty strings "" — do not generate theme benchmarks,',
  "  cross-pursuit world-knowledge, or population norms on reflect.",
  "- Pursuit comparison (Worth knowing) owns per-pursuit domain gloss; theme Reading is synthesis from map facts only.",
].join("\n");

export const PURSUIT_CONTEXT_TAB_NON_DUPLICATION = [
  "PURSUIT CONTEXT TAB NON-DUPLICATION:",
  "- enrichAnswers (Quick Question answers) appear on the pursuit Context tab — the user already sees prompt + selectedOption there.",
  "- Do NOT restate enrichAnswers in headline, body, or comparison (no listing supplements, routes, or options the user already confirmed).",
  "- comparison (Worth knowing) may add domain gloss FOR those facts (what protein/creatine/ashwagandha are generally for)",
  "  without repeating that the user takes them.",
  "- body uses enrichAnswers only for cross-pursuit tension on the map — never as a glossary of the answers themselves.",
].join("\n");

export const PURSUIT_INSIGHT_FIELD_LANES = [
  "PURSUIT INSIGHT FIELD LANES:",
  "- headline: the single sharpest STATE fact right now — what is most salient about this pursuit's present position",
  "  (not the Status / Deadline / Significance labels; the Details row owns those).",
  "- body: MAP-RELATIONSHIPS — how this pursuit sits against OTHER pursuits on the map, what led to it,",
  "  within-theme tension, cross-pursuit competition or support.",
  "  Do NOT restate the headline's fact in the body.",
  "  Do NOT restate Status, Deadline, or Significance — the Details row shows those.",
  "  Do NOT restate milestone row titles (the milestone list is on screen).",
].join("\n");

export const PURSUIT_BODY_DOMAIN_CONTEXT_RULE = [
  "PURSUIT body — optional cross-pursuit domain context (qualitative only):",
  "- body may include AT MOST ONE sentence of qualitative domain context ONLY when it explains a cross-pursuit",
  "  relationship on the map (why pursuing this alongside named siblings competes, complements, or constrains).",
  "- Do NOT put standalone \"what this pursuit type is\" domain context in body — that belongs in comparison",
  "  (Worth knowing per INSIGHT-CARD-REDESIGN-SPEC.md), not in body.",
  "- DESCRIPTIVE only — never prescriptive: no \"you should\", \"consider\", \"I recommend\", \"try\", imperative openings,",
  "  no recommending new actions, and no suggesting new pursuits (that is a separate deferred product feature).",
  "- QUALITATIVE only — no invented numbers, percentiles, rankings, or timelines; those belong in comparison,",
  "  fenced to <benchmark_facts> when present.",
  "- About the domain in general — not a new fact about the user's life or map.",
  "- OMIT this sentence when there is nothing substantive and defensible to say; do not pad.",
  "- Remaining body sentences stay map-grounded (cross-pursuit tensions, enrichAnswers, sibling pursuits).",
].join("\n");

/** JSON key `comparison` is historical; UI label is Worth knowing per INSIGHT-CARD-REDESIGN-SPEC.md. */
export const PURSUIT_COMPARISON_FIELD_JOBS = [
  "PURSUIT comparison field (JSON key historical; UI label: Worth knowing ·):",
  "- Worth knowing = domain insight the map does NOT contain — what this pursuit type is, what the role or goal",
  "  involves, qualifications in the field, market demand, what it opens up. Qualitative parametric knowledge",
  "  is encouraged when substantive and defensible.",
  "- Body owns map-relationships and cross-pursuit angles; worth-knowing owns standalone domain context for THIS pursuit.",
  "- Do NOT restate enrichAnswers (Context tab) — interpret them with domain gloss only; never list what the user already confirmed.",
  "- Do NOT restate Status, Deadline, Significance, or milestone progress (Details row + body own those).",
  "- Do NOT borrow another pursuit's progress story — e.g. on a broker-role card, do NOT restate a sibling",
  "  qualification's completion timeline; describe the broker role/market and what CeMAP opens across lenders.",
  "- DESCRIPTIVE only — never prescriptive: no \"you should\", \"consider\", \"I recommend\", imperative openings.",
  "- Quantified population norms: use <benchmark_facts>, age, location, and pursuit quantified fields when present;",
  "  do NOT invent statistics, percentiles, or timelines not in <benchmark_facts>.",
  "- Do NOT write editorial career narratives or vague filler.",
  "- At most one worth-knowing observation per pursuit (<= 500 chars). Omit when nothing substantive to say.",
].join("\n");
