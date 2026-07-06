/** Shared theme-level insight field jobs for reflect prompts. */

export const THEME_INSIGHT_FIELD_LANES = [
  "THEME READING FIELD LANES:",
  "- oneLiner: the read — one sentence on where this theme's weight sits or what tension defines it.",
  "  When Active chapters have deadlines or targets, close with what the user is aiming toward on the map — plan mirror, not praise.",
  "- reflective (From your map): map-grounding the read did not already say —",
  "  name chapter titles verbatim (never the filler noun \"chapter\" — use titles like \"Third Job\", \"Clear Credit Card\", not \"this chapter\" or \"the X chapter\").",
  "  Cite entered facts (amounts, deadlines, milestone completion, status contrasts).",
  "  When <chapter_age_facts> exists, you may anchor facts in age-chronology order — follow voicing hints; do not restate an unchanged age.",
  "- Do NOT restate the oneLiner's conclusion in reflective — if a sentence could replace the headline, delete it.",
  "- Wrong: oneLiner \"Long-term investing is the through-line\"; reflective \"The theme centers on building wealth through steady contributions toward a significant target.\"",
  '- Right: oneLiner "The ISA target and current balance are miles apart — contributions are set but the gap is the story.";',
  '  reflective "At 17 the apprenticeship, and that same year the Level 3 course; the first mortgage role came two years on, at 19."',
].join("\n");

export const THEME_INSIGHT_NON_DUPLICATION = [
  "THEME NON-DUPLICATION:",
  "- oneLiner = the read (interpretation); reflective = specific map facts that ground it — never a paraphrase.",
  "- Each line adds new information: oneLiner names the theme bottleneck or what is carrying it;",
  "  reflective names chapters and cites entered data the headline did not already state.",
  "- Ban near-duplicate phrasing: if reflective reuses the headline's core nouns or swaps synonyms for the same claim, rewrite it with chapter titles and numbers.",
  "- Ban the filler noun \"chapter\" in reading prose — use chapter titles verbatim instead.",
  '  Wrong: "This chapter sits alongside the ISA." Right: "Clear Credit Card sits alongside the ISA."',
  "- Ban meta UI copy: never \"confirmed relationships on your map\", \"your map shows\", or \"the app sees\".",
  "- Ban theme filler without map numbers: \"long-term growth\", \"steady contributions\", \"significant target\" when no entered amount/deadline backs them.",
  "- Ban timeline recap as theme synthesis: listing Complete chapters in order and calling it \"progression\" or a \"clear path\".",
  "- Ban invented bridges between chapters the map does not connect (e.g. unrelated degree → unrelated job as \"clear progression\").",
].join("\n");

export const THEME_PLAN_MIRROR_RULE = [
  "THEME PLAN MIRROR (read the user's authored future — not a history summary):",
  "- Active and Maintaining chapters with deadlines, targets, or open milestone frontiers are PLANNED FUTURE on the map.",
  "- Theme oneLiner: read the theme as a PLAN — what carries it forward, the bottleneck, what competes — not a diary recap.",
  "- When Active/plan chapters AND Complete chapters coexist, weight the Active plan in oneLiner; Complete chapters ground reflective only.",
  "- When every chapter in the theme is Complete and nothing Active or Maintaining continues the arc, oneLiner MUST name the empty frontier plainly.",
  "- Use <reading_packet> lines (Active with deadlines, gapFacts, amount rows) and map_context status/deadline/target fields.",
  "",
  "Wrong (recap): \"Formal education and first professional role establish a clear progression from academic study to a professional role.\"",
  "Wrong (trivial echo): \"Monthly contributions align with the annual ISA limit, setting a clear path for long-term growth.\"",
  'Right (plan tension): "The ISA target is £500k+ and the balance is over £100k — contributions are set but the gap is still the story."',
  'Right (missing frontier): "Formal Education and First Job are both complete — nothing Active on the map after 2021 names what comes next."',
  'Right (discontinuity): "A geology BSc and an estate-agency first role are both complete — the map does not connect them."',
].join("\n");

export const THEME_INSIGHT_FIELD_JOBS = [
  "THEME INSIGHTS (macro synthesis of the user's plan in this theme — not per-chapter narrative or history recap):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 140 chars — one complete, self-contained thought (a full sentence, not a fragment);",
  "  must never trail off mid-phrase. Name what is carrying this theme or where the bottleneck sits",
  "  (not a chapter-by-chapter summary).",
  "",
  THEME_PLAN_MIRROR_RULE,
  "",
  THEME_INSIGHT_FIELD_LANES,
  "",
  "  reflective (UI: FROM YOUR MAP — map facts the oneLiner did not already state):",
  "  - Name specific chapters verbatim and cite entered facts: amounts, deadlines, milestone completion, status contrasts (<= 800 chars).",
  "  - Cross-chapter contrasts belong here only as factual juxtapositions between named chapters — not a second synthesis pass.",
  "  - Do not inventory every row; pick the facts that ground the headline.",
  "  - Each sentence anchors to a chapter title from map_context and a fact the user entered there.",
  "  - If a sentence would read the same on another user's map, rewrite it from their chapter titles and entries.",
  THEME_INSIGHT_NON_DUPLICATION,
  "  Do not repeat chapter-panel execution copy in theme insights — chapter sheets own per-chapter velocity.",
  "  Only include themes listed in <dirty_themes>. Skip themes with no chapters.",
].join("\n");

export const NOTABLE_FACTS_OBSERVATION_RULE = [
  "NOTABLE FACTS (observed — never cheered, never scored):",
  "- When the map shows a known ceiling or limit hit (e.g. contributions at £20k ISA allowance, target at allowance),",
  "  name that it is uncommon or relatively few people do this — not neutral admin alignment.",
  "- Qualitative allowed: \"uncommon at this age\", \"most people contribute a fraction\", \"relatively few max out annually\".",
  "- Hard ban: percentiles, rankings, top-decile, invented statistics, cheerleading (\"great job\", \"impressive\").",
  "",
  'Wrong: "Monthly contributions align with the annual ISA limit."',
  'Right: "Contributions hit the full £20k allowance — that is uncommon; most people use a fraction."',
  "",
  'Wrong: "Saving £500k in an ISA is a great financial goal."',
  'Right: "The ISA target is £500k; the balance on the map is a fraction of that — those two numbers sit in tension."',
].join("\n");

export const THEME_REFLECT_OUTPUT_CONTRACT = [
  "THEME OUTPUT (reflect path):",
  '- "themes": map of themeId -> { tone, oneLiner, reflective, contextual }.',
  "Mobile UI maps theme fields to: Headline (oneLiner), FROM YOUR MAP (reflective),",
  "WORTH KNOWING (contextual).",
  "",
  "  contextual (JSON key historical; UI: Worth knowing · — optional, <= 500 chars):",
  "  - Worth knowing = consequential domain or pattern context the map does NOT contain — theme-level synthesis",
  "    of what makes this theme notable given category mix, background, enrichAnswers, trajectory, or sibling chapters.",
  "  - Qualitative patterns allowed without <benchmark_facts>; quantified population norms require <benchmark_facts>",
  "    plus the user's map numbers — no invented percentiles, growth rates, or timelines.",
  "  - Do NOT restate trivial arithmetic the oneLiner or reflective already stated",
  "    (e.g. \"contributions align with the £20k ISA limit\" alone).",
  "  - When a ceiling or limit is hit on the map, apply NOTABLE FACTS — name uncommon/observed, not admin alignment.",
  "  - Do NOT duplicate a pursuit-level Worth knowing observation for the same fact —",
  "    theme Worth knowing is theme-level synthesis; chapter Worth knowing owns per-chapter domain context.",
  "  - If contextual contains no fact absent from the user's own inputs (background, enrichAnswers, amounts, deadlines), write \"\".",
  "  - Wrong: restating the user's own plan back as external knowledge (e.g. \"clearing credit card debt before 0% expires is a common strategy\" when that is already their stated plan).",
  "  - Write \"\" when nothing substantive to say.",
  "",
  NOTABLE_FACTS_OBSERVATION_RULE,
  "",
  "  When contextual would be empty, write \"\" — do not pad.",
  "  oneLiner and reflective remain required when the theme has chapters; contextual is optional.",
].join("\n");

export const OVERALL_READING_FIELD_JOB = [
  "OVERALL READING (whole-map synthesis — Reading tab hero above all theme cards):",
  "- oneLiner: ONE complete, self-contained sentence (<= 120 chars) naming the 2–3 heaviest active chapters across themes.",
  "  Use chapter titles — never the filler noun \"chapter\" (not \"this chapter\", not \"the X chapter\").",
  "  Must never trail off mid-phrase or mid-clause — no ellipsis, no fragment.",
  "  Weave multiple themes when the map has more than one — do NOT echo a single theme's oneLiner verbatim.",
  "  Use <reading_packet> mapAggregates.highSignificanceActive, changeEvents, and recentEvents",
  "  to decide what carries the map right now.",
  "- support: one supporting sentence (<= 480 chars) — cross-theme shape the theme cards below cannot say.",
  "  Name chapter titles — never the filler noun \"chapter\".",
  "  Name deadline clusters, competing seasons, or tensions that span themes — observation only, not coaching.",
  "  Do NOT enumerate every theme or repeat what each theme card already says.",
  "  Do NOT anthropomorphize themes (themes do not act — the user does).",
  "  Wrong: \"Work & Career is focused on Third Job; Money & Finance is balancing the SiPP…; Health & Body is training for a Half Marathon.\"",
  "  Right: \"Three deadlines cluster between October and December — job search, app launch, and marathon prep share the same autumn window.\"",
  "- Wrong: copy Money & Finance oneLiner alone when Work & Career also has active chapters.",
  '- Right oneLiner: "The apprenticeship is building skills while the ISA gap stays the long-range anchor."',
  '- Right support: "Three deadlines cluster between October and December — job search, app launch, and marathon prep share the same autumn window."',
].join("\n");

export const OVERALL_READING_OUTPUT_CONTRACT = [
  "OVERALL OUTPUT (full reflect path only — omit on pursuits-only calls):",
  '- "overall": { tone, oneLiner, support }',
  "  tone MUST be one of: celebratory | encouraging | nudge",
  "  oneLiner <= 120 chars — one complete sentence; must never trail off mid-phrase.",
  "  support <= 480 chars — cross-theme shape, not a per-theme roll-call.",
  "  Required on every full-scope reflect response when the map has at least one chapter.",
  "",
  OVERALL_READING_FIELD_JOB,
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
  "- enrichAnswers (Quick Question answers) appear on the chapter About tab — the user already sees prompt + selectedOption there.",
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
  "  Never write significance as a number or rating (no 2/3, no 'significance of 3', no 'out of three').",
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
  "- Do NOT restate enrichAnswers (About tab) — interpret them with domain gloss only; never list what the user already confirmed.",
  "- Do NOT restate Status, Deadline, Significance, or milestone progress (Details row + body own those).",
  "- Do NOT borrow another chapter's progress story — e.g. on a broker-role card, do NOT restate a sibling",
  "  qualification's completion timeline; say what the broker role opens given their map.",
  "- DESCRIPTIVE only — never prescriptive: no \"you should\", \"consider\", \"I recommend\", imperative openings.",
  "- Quantified population norms: use <benchmark_facts>, age, location, and chapter quantified fields when present;",
  "  do NOT invent statistics, percentiles, or timelines not in <benchmark_facts>.",
  "- When a ceiling or limit is hit on the map, apply NOTABLE FACTS (see theme prompt) — name uncommon/observed.",
  "- Do NOT write editorial career narratives or vague filler.",
  "- If comparison contains no fact absent from the user's own inputs (background, enrichAnswers, amounts, deadlines), omit it.",
  "- Wrong: paraphrasing the user's Context back as external knowledge (e.g. \"981/718 models are at the bottom of their depreciation curve\" when that is already their note).",
  "- At most one worth-knowing observation per chapter (<= 500 chars). Omit when nothing substantive to say.",
].join("\n");
