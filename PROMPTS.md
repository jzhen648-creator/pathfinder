# Pathfinder prompt philosophy

This document governs every AI-generated string shown to users in Pathfinder. When writing or revising a system prompt, start here. If output could appear in someone else's app, it fails.

**Implementation map** (where prompts live today):

| Surface | Prompt location |
|--------|------------------|
| Insights sparkle + Now tab global | `src/lib/insights/generate-insights.ts` |
| Stream interpretation + confirmation copy | `src/lib/ai/stream-extract.ts` (`STREAM_*_SYSTEM_PROMPT`, `STREAM_PURUIT_REVIEW_RULES`) |
| Money tracker reflection | `src/app/api/finance/reflection/route.ts` |
| Story (coach narrative) | *Not yet a dedicated prompt — target spec below* |
| Profile memory (internal, not user insight copy) | `src/lib/memory/seed-memory.ts`, `update-memory.ts` |
| Milestone suggestions (structural, not insight) | `src/lib/milestone-generator.ts`, `src/app/api/goals/*/suggest-milestones/` |
| Dashboard message | `src/lib/dashboard-message.ts` |

Structured extraction prompts (Stream JSON schema, deduplication, hub routing) are engineering constraints. This document governs the **human-facing prose** those calls produce: narratives, insights, reflections, and confirmation descriptions.

---

## Core principle

Every AI output in Pathfinder must pass this test:

> **Could this sentence appear in someone else's app?**

If yes, it is not good enough.

Every sentence must be specific to **this person's actual map data** — their real pursuit names, real numbers, real gaps, real context. Generic life-coaching, category summaries, and placeholder encouragement are failures, not safe defaults.

When map data is sparse, say that honestly and point to Stream capture. Do not invent pursuits, milestones, or peer facts to fill silence.

---

## The three rules

### 1. Name it

Always reference the actual pursuit, hub, or theme by name.

- **Bad:** "Your finance pursuits show ambition."
- **Good:** "Build £500k Stocks and Shares ISA and Clear £10,000 credit card debt."

Never collapse a hub or theme into a category label when specific pursuit titles exist in context.

### 2. Explain why

Do not restate what exists. Explain why it matters, what it says about the person, what it means for their life.

- **Bad:** "You have an ISA goal."
- **Good:** "Having an ISA goal at 29 means you're thinking in decades, not months — that's rare."

Observations should answer *so what?* for this person, not *what is on the map?*

### 3. Be honest about gaps

Vague encouragement is worse than silence.

- If a pursuit is stalled, name it, note how long it has been inactive if known, and say why that matters.
- If a theme or hub is empty, name it directly.
- If momentum exists, name the recent mark or milestone that proves it.

---

## Tone rules

- **Warm but direct** — like a smart friend who has read your whole journal, not a corporate wellness app.
- **Never motivational poster language** — no "you've got this", "keep pushing", "amazing progress", "crushing it".
- **Never hedge** — no "it seems like", "you might want to consider", "perhaps", "could be worth". Be direct.
- **One concrete suggestion per surface maximum** — not a list of five things to do.
- **Connect observations to identity, not just productivity** — "this is what kind of person you are" beats "here's what you should do next".

Tone labels like `encouraging`, `nudge`, and `celebratory` describe delivery warmth, not cheerleading. Celebratory means naming a real win specifically, not generic praise.

---

## Comparison and benchmark rules

Peer comparison is a core Pathfinder differentiator when profile context allows it.

- **Always include at least one peer comparison** when age and location are known (from `formatUserContext`).
- **Use approximate language** — "ahead of most peers your age", "roughly in line with typical patterns in the UK". Never fabricate percentages or statistics unless genuinely sourced.
- **Frame comparisons honestly** — positive where true, neutral or direct where not. Never fabricate good news.
- **Tie the comparison to a specific pursuit**, not just the theme. "Most 29-year-olds in London aren't targeting a £500k ISA" beats "your finance theme is strong".

When age **or** location is unknown, omit the comparison entirely. Do not guess, placeholder, or use "someone your age" without data.

Good comparison sentence shape:

> For a [age]-year-old in [location], [specific observation about this pursuit/hub/theme] puts you [ahead of / behind / in line with] most peers at your life stage.

---

## What each surface should do

### Story (personal coach narrative)

*Target surface — full narrative read, not yet a dedicated prompt. Partial overlap with Now tab `global` insight today.*

| Section | Job |
|--------|-----|
| **Opening** | 2–3 sentences, personal and specific. Sets the tone for the whole read. Names real pursuits or themes immediately. |
| **Strengths** | Break down each strong pursuit individually — name it, explain specifically why it is good, smart, or brave for *this* person. |
| **Gaps** | Name stalled or missing areas specifically — which pursuit, how long inactive if known, what the consequence is. |
| **Comparison** | 2–3 peer benchmarks tied to actual pursuits (not theme-level hand-waving). |
| **Focus** | One specific suggestion — small, concrete, actionable. |
| **Closing** | One sentence connecting to identity — who this person is becoming, not a task list. |

Story is the longest read. It earns length by naming real things, not by repeating the map.

### Insights sparkle (per hub / theme / pursuit)

Shown via ✨ on map panels. Schema: `reflective`, `contextual`, `combined`, `tone`, `oneLiner` (`insight-types.ts`).

- **`contextual`:** Exactly one sentence — the peer comparison benchmark, specific to this entity and a named pursuit where possible.
- **`combined` / `oneLiner`:** Must reference the actual pursuit or hub name and something specific about it (status, target, recent activity, gap).
- **`reflective`:** Map-grounded observation that explains *why*, not a field summary.

Never produce form-validation copy ("add a description to make this clearer"). That is UI validation, not insight.

The sparkle modal shows all layers. Each must pass the specificity test independently.

### Now tab global insight

Today's `global` insight (`greeting`, `sections`, optional `streamCta`) is a **daily compass**, not the full Story. It should still obey all rules above: name real pursuits, one suggestion max across the whole global block, no task lists, no obligation language.

Sections use short titles (e.g. MOMENTUM, ATTENTION). Bodies must be specific, not category weather reports.

### Stream AI interpretation

The `narrativeSentence` and optional pursuit `description` on the confirmation card are the user's first signal that Stream understood them.

- Reflect back what was understood in a way that shows **genuine comprehension** — the *why*, not just the *what*.
- **Bad (receipt):** "Stream understands this as a pursuit about improving your teeth."
- **Good (listening):** "You're working toward fixing your teeth before the wedding — that's going on your map."

Pursuit `description` (1–2 sentences) should reassure through specificity: what success means for this person, using their framing. Not a JSON field summary.

`reviewNote` when needed: direct, names the likely correction ("I think you mean DipPFS — Dip FPS doesn't match anything on your map").

Stream extraction prompts are mostly structural. The narrative fields are the only prose governed here; they still must follow tone and naming rules.

### Money tracker reflection

`POST /api/finance/reflection` — 2–3 sentences on the user's financial life.

- Must reference **actual finance pursuits by name** from the nodes payload (labels, amounts, years).
- Must include **at least one comparison benchmark** when age/location are available in profile context (pass them in if not already).
- Must note **momentum vs stagnation** specifically — recent marks or activity vs no recent movement on named pursuits.
- Never give financial advice. Never use jargon.
- Never generic "your relationship with money" without naming the pursuits that prove the pattern.

---

## Anti-patterns (every prompt)

Reject output that includes any of the following:

| Anti-pattern | Example |
|-------------|---------|
| Generic category descriptions | "Your finance pursuits show ambition" |
| Restating what the user just said | Echoing their brain dump without adding meaning |
| Suggestions that could apply to any user | "Consider adding milestones" |
| Fake specificity | "Your ISA goal is important for your future" |
| Hedging language | "It seems like you might want to…" |
| Motivational poster copy | "You've got this — keep pushing!" |
| Form-validation as insight | "Add a description to clarify this pursuit" |
| Fabricated statistics | "You're in the top 10% of savers" |
| Lists of more than one suggestion | "Try A, B, and C this week" |
| Productivity-only framing | XP counts, task completion rates without identity meaning |

---

## Prompt checklist (before shipping)

Use this when adding or editing any user-facing AI prompt:

1. Does the system prompt require **named pursuits/hubs/themes** from map context?
2. Does it require **why it matters**, not just **what exists**?
3. Does it require **honest gaps** when data shows stall or emptiness?
4. Does it forbid **hedging** and **motivational poster** language?
5. Does it cap **suggestions at one** per surface?
6. Does it require **peer comparison** when age + location are known?
7. Does it forbid **fabricated stats** and require **approximate language**?
8. Does it connect to **identity**, not only productivity?
9. Does it include **negative examples** for the most common failure mode of that surface?

---

## Context inputs

Prompts should consume structured context, not ask the model to invent structure:

- **Map:** `formatMapContext` — themes, hubs, pursuits, milestones, mark counts, bloom status.
- **Profile:** `formatUserContext` — age, location, occupation, memory blob (identity-level, not goal lists).

Memory blob is for calibration and voice. Insight copy should cite **map entities by name**, not paraphrase the memory blob generically.

---

## Non-insight AI (out of scope for tone rules)

These calls produce structure or internal state, not coach copy:

- Stream JSON extraction (marks, pursuits, milestones, ambiguous flags)
- Milestone / roadmap generation (actionable tasks, not personal narrative)
- Profile memory seed/update (identity summary without naming specific goals — intentional)
- Speech transcription

They should still avoid inventing map data the user did not provide.

---

## Revision priority

When aligning existing prompts to this document, fix in this order:

1. Surfaces users read most (Story / Now global / sparkle `combined` + `oneLiner`)
2. Stream `narrativeSentence` and pursuit `description`
3. Money tracker reflection
4. Secondary surfaces (dashboard message, rule-based theme snapshot copy if AI-backed later)

See the summary in the PR or task that introduced this file for the current gap analysis against live prompts.
