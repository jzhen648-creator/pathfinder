/** Shared theme-level insight field jobs for reflect + generate-insights prompts. */

export const THEME_INSIGHT_NON_DUPLICATION = [
  "THEME NON-DUPLICATION:",
  "- oneLiner = one complete theme headline sentence; reflective = cross-chapter relationships and tensions the headline did not state.",
  "- Each line adds new information: oneLiner names the theme bottleneck or what is carrying it; reflective holds within-theme links the headline did not state.",
  "- Ban meta UI copy: never \"confirmed relationships on your map\", \"your map shows\", or \"the app sees\".",
].join("\n");

export const THEME_INSIGHT_FIELD_JOBS = [
  "THEME INSIGHTS (macro synthesis — not per-chapter narrative):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 140 chars — one complete, self-contained thought (a full sentence, not a fragment);",
  "  must never trail off mid-phrase. Name what is carrying this theme or where the bottleneck sits",
  "  (not a chapter-by-chapter summary).",
  "",
  "  reflective (UI: FROM YOUR MAP — within-theme relationships the oneLiner did not state):",
  "  - How chapters in this theme support, compete, or sequence — tensions and links, not a status/date inventory",
  "    the reader can read off chapter rows or the meta strip (<= 800 chars).",
  "  - Name specific chapters when data supports it; do not inventory every row.",
  "  - Each sentence anchors to a chapter title from map_context and a fact the user entered there —",
  "    deadline, milestone completion, target amount, current amount, enrichAnswer, or how two chapters relate.",
  "  - Relate chapters to each other within the theme using only those entered facts; if a sentence would read the same on another user's map, rewrite it from their chapter titles and entries.",
  THEME_INSIGHT_NON_DUPLICATION,
  "  Do not repeat chapter-panel execution copy in theme insights — chapter sheets own per-chapter velocity.",
  "  Only include themes listed in <dirty_themes>. Skip themes with no chapters.",
].join("\n");

export const THEME_REFLECT_OUTPUT_CONTRACT = [
  "THEME OUTPUT (reflect path — map-only):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective } only.',
  '- contextual and combined MUST be empty strings "" — do not generate theme benchmarks,',
  "  cross-chapter world-knowledge, or population norms on reflect.",
  "- Worth knowing (comparison field) owns per-chapter consequential domain context; theme Reading is synthesis from map facts only.",
].join("\n");

export const PURSUIT_PANEL_UI_CONTEXT = [
  "CHAPTER PANEL — WHAT THE READER ALREADY SEES:",
  "- Full chapter title in the header directly above the reading.",
  "- Status label (Complete, Active, Paused, …) in the meta strip between the reading and the tabs.",
  "- Status, deadline, and significance in the About details row.",
  "- Milestone row titles on the Milestones tab (below the reading when browsing).",
  "Write for someone who has just read those — headline and body add what those surfaces do not.",
  "Do NOT restate, enumerate, or quote milestone titles in headline, body, or comparison.",
  'Do NOT write "next step is X" or "your next milestone is X" when X is already a visible milestone row.',
  "Read milestones as grounding for trajectory: pace, gaps, and what completion implies — without naming row labels.",
].join("\n");

export const PURSUIT_CONTEXT_TAB_NON_DUPLICATION = [
  "CHAPTER CONTEXT TAB NON-DUPLICATION:",
  "- enrichAnswers (Quick Question answers) appear on the chapter Context tab — the user already sees prompt + selectedOption there.",
  "- Do NOT restate enrichAnswers in headline, body, or comparison (no listing supplements, routes, or options the user already confirmed).",
  "- comparison (Worth knowing) may add consequential domain gloss FOR those facts (what that stack opens for their training chapter)",
  "  without repeating that the user takes them.",
  "- body uses enrichAnswers only for cross-chapter tension on the map — never as a glossary of the answers themselves.",
].join("\n");

export const PURSUIT_READING_AUTHORSHIP_ORDER = [
  "CHAPTER READING AUTHORSHIP (chapter headline/body/comparison ONLY — does NOT apply to theme oneLiner or reflective):",
  "- Lead headline and body from status, deadline, milestone pace, amount progress, and timeline arc in <focal_chapter_facts> or <reading_packet>.",
  "- enrichAnswers in <confirmed_on_context_tab> are supporting interpretation — never the primary subject of headline or body.",
  "- Wrong: restating three confirmed Quick Question picks as the entire chapter reading.",
  "- Right: position the chapter from structured map facts; use at most one enrichAnswer mention in body only when it explains tension vs a named sibling chapter.",
].join("\n");

export const PURSUIT_INSIGHT_FIELD_LANES = [
  "CHAPTER READING FIELD LANES:",
  "- headline: the sharpest fact the reader does not already have from the title, meta strip, or Details row —",
  "  what is most salient about this chapter's present position right now.",
  "- body: MAP-RELATIONSHIPS — how this chapter sits against OTHER chapters on the map, what led to it,",
  "  within-theme tension, cross-chapter competition or support.",
  "  Do NOT restate the headline's fact in the body.",
  "  Do NOT restate Status, Deadline, or Significance — the Details row shows those.",
  "  Do NOT restate milestone row titles (the milestone list is on screen).",
].join("\n");

export const PURSUIT_BODY_DOMAIN_CONTEXT_RULE = [
  "CHAPTER body — optional cross-chapter domain context (qualitative only):",
  "- body may include AT MOST ONE sentence of qualitative domain context ONLY when it explains a cross-chapter",
  "  relationship on the map (why pursuing this alongside named siblings competes, complements, or constrains).",
  "- Do NOT put standalone \"what this chapter type is\" domain context in body — that belongs in comparison",
  "  (Worth knowing per INSIGHT-CARD-REDESIGN-SPEC.md), not in body.",
  "- DESCRIPTIVE only — never prescriptive: no \"you should\", \"consider\", \"I recommend\", \"try\", imperative openings,",
  "  no recommending new actions, and no suggesting new chapters (that is a separate deferred product feature).",
  "- QUALITATIVE only — no invented numbers, percentiles, rankings, or timelines; those belong in comparison,",
  "  fenced to <benchmark_facts> when present.",
  "- About the domain in general — not a new fact about the user's life or map.",
  "- OMIT this sentence when there is nothing substantive and defensible to say; do not pad.",
  "- Remaining body sentences stay map-grounded (cross-chapter tensions, enrichAnswers, sibling chapters).",
].join("\n");

/** JSON key `comparison` is historical; UI label is Worth knowing per INSIGHT-CARD-REDESIGN-SPEC.md. */
export const PURSUIT_COMPARISON_FIELD_JOBS = [
  "CHAPTER comparison field (JSON key historical; UI label: Worth knowing ·):",
  "- Worth knowing = consequential domain context the map does NOT contain — what this chapter opens, positions",
  "  the user for, or makes notable given their category, background, enrichAnswers, trajectory, or sibling chapters.",
  "- On-spec: ties domain knowledge to THIS user's map (\"CeMAP unlocks lender-panel advising between your",
  "  qualification chapter and any broker move on the map\").",
  "- Off-spec: bare definitional gloss with no link to their situation (\"mortgage broker roles involve sourcing",
  "  cases across lenders\"). If the only available domain note would be generic/definitional, omit comparison.",
  "- Body owns map-relationships and cross-chapter angles; worth-knowing owns consequential domain context for THIS chapter.",
  "- Do NOT restate enrichAnswers (Context tab) — interpret them with domain gloss only; never list what the user already confirmed.",
  "- Do NOT restate Status, Deadline, Significance, or milestone progress (Details row + body own those).",
  "- Do NOT borrow another chapter's progress story — e.g. on a broker-role card, do NOT restate a sibling",
  "  qualification's completion timeline; say what the broker role opens given their map.",
  "- DESCRIPTIVE only — never prescriptive: no \"you should\", \"consider\", \"I recommend\", imperative openings.",
  "- Quantified population norms: use <benchmark_facts>, age, location, and chapter quantified fields when present;",
  "  do NOT invent statistics, percentiles, or timelines not in <benchmark_facts>.",
  "- Do NOT write editorial career narratives or vague filler.",
  "- At most one worth-knowing observation per chapter (<= 500 chars). Omit when nothing substantive to say.",
].join("\n");
