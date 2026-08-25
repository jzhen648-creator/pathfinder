# Almanac prompt philosophy

> **Legacy AI prompt reference.** Reflect, Story, pursuit and similar pipelines
> are not current Almanac product architecture. Use
> [`../docs/current/ALMANAC-PRODUCT-CANON.md`](../docs/current/ALMANAC-PRODUCT-CANON.md)
> and inspect the active `src/lib/almanac/` implementation before changing prompts.

This document governs every AI-generated string shown to users in Almanac. When writing or revising a system prompt, start here. If output could appear in someone else's app, it fails.

**Implementation map** (where prompts live today — updated 2026-07-13; Stream/Story/memory prompt modules were removed with the desktop retirement):

| Surface | Prompt location |
|--------|------------------|
| Reflect sync (Reading + theme insights + pursuit panels) | `src/lib/ai/generate-reflect.ts` |
| Quick questions / clarifiers | `src/lib/pursuit/clarifier-prompt-blocks.ts`, `clarifier-question-prompt.ts`, `generate-create-clarifier.ts` |
| Pursuit enrich | `src/lib/pursuit/generate-pursuit-enrich.ts`, `pursuit-insight-prompt-context.ts` |
| Insight voice/tone blocks | `src/lib/insights/insight-voice-prompt-blocks.ts`, `theme-insight-prompt-blocks.ts`, `pursuit-tone-prompt.ts` |
| Money tracker reflection | `src/app/api/finance/reflection/route.ts` |
| Milestone suggestions (structural, not insight) | `src/lib/milestone-generator.ts`, `src/app/api/goals/*/suggest-milestones/` |
| Status-change prompts | `src/lib/ai/pursuit-status-prompt.ts` |

This document governs the **human-facing prose** those calls produce: narratives, insights, reflections, and confirmation descriptions.

---

## Core principle

Every AI output in Almanac must pass this test:

> **Could this sentence appear in someone else's app?**

If yes, it is not good enough.

Every sentence must be specific to **this person's actual map data** — their real pursuit names, real numbers, real gaps, real context. Generic life-coaching, category summaries, and placeholder encouragement are failures, not safe defaults.

When map data is sparse, say that honestly and point to Stream capture. Do not invent pursuits, milestones, or peer facts to fill silence.

---

## The three rules

### 1. Name it

Always reference the actual pursuit or theme by name (not hidden taxonomy category labels).

- **Bad:** "Your finance pursuits show ambition."
- **Good:** "Build £500k Stocks and Shares ISA and Clear £10,000 credit card debt."

Never collapse a theme into a generic category label when specific pursuit titles exist in context.

### 2. Explain why

Do not restate what exists. Explain why it matters, what it says about the person, what it means for their life.

- **Bad:** "You have an ISA goal."
- **Good:** "Having an ISA goal at 29 means you're thinking in decades, not months — that's rare."

Observations should answer *so what?* for this person, not *what is on the map?*

### 3. Be honest about gaps

Vague encouragement is worse than silence.

- If a pursuit is stalled, name it, note how long it has been inactive if known, and say why that matters.
- If a theme is empty, name it directly.
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

External benchmarks are a core Almanac differentiator when profile context allows it (`contextual` field on sparkle insights).

- **Fill `contextual` when age and location are known** (from `formatUserContext`). Use name, age, and location **inside** the benchmark logic — not as a prefix decoration.
- **Deliver real benchmark information** — typical salary ranges, qualification timelines, milestone prevalence at that age/location. Concrete approximate numbers when defensible.
- **Use approximate language** — "roughly £45–55k", "typically 2–3 years", "fewer than half of…". Omit if unsure; never invented precision.
- **Frame honestly** — positive where true, neutral or direct where not. Never generic filler ("valued in a competitive market").
- **Tie benchmarks to this pursuit**, not theme-level hand-waving.

When age **or** location is unknown, set `contextual` to an empty string. Do not guess or use "someone your age" without data.

**Story exception:** The live Story prompt in `generate-story.ts` is stricter — no peer comparison inside strength bodies; age, location, occupation, and life stage at most once per reading; comparison optional and omitted if already used in opening. Per-entity Insights (sparkle) still follow this section.

---

## What each surface should do

### Insights tab reading (whole-map)

*Live prompt: `src/lib/story/generate-story.ts`. Powers the mobile **Insights** tab — not per-pursuit sparkle (`generate-insights.ts`).*

| Field | Job |
|--------|-----|
| **seasonRead** | Two to three short paragraphs. One reflective **reading** of the whole map — complementary to per-pursuit panels, not a duplicate inventory. Weave high-significance pursuits when relevant. Benchmark woven in when age **and** location known — holistic (career + finances + life stage), not a separate section. |

**Hard bans:** task lists; status buckets; pursuit inventory; chapter timeline; per-pursuit sparkle copy; peer-comparison prefix filler; pursuit count stats; duplicating Map (spatial) or Timeline (dated spine).

**Reading rubric (two lenses — not a checklist):** These are lenses for reading the map, not sections to complete. Write one continuous prose voice — no sections, no per-theme blocks, no enumerated structure. Address only what the map actually triggers; if the map says nothing about a lens, do not mention it. A reading may legitimately answer only one lens. Honesty remains a Voice law (not a fourth question).

| Lens | Question |
|------|----------|
| **Gap** | Where is significance high but movement absent, especially near a deadline? Name it plainly; point at the smallest next action. |
| **Arrival** | What's been completed, and what does the arc say about direction? Backward-looking counterweight to what's active now. |

The whole-map reading sees what no single pursuit panel can: the shape of the map as a whole. Do not inventory pursuits one by one — pursuit panels already do that. Instead, say one thing about Gap (where is significance high but movement absent?) and one thing about Arrival (what's been completed and what does the arc say?) that only makes sense when looking at the full map.

Use paragraph breaks between distinct observations. Each paragraph should connect related pursuits — what do they reveal together that neither reveals alone? Do not list pursuits one by one. Two to three short paragraphs.

The packet flags pursuits as `gap` (significant, near deadline, no movement) or `arrival` (recently completed). Name gap-flagged pursuits plainly as tensions, not momentum. Narrate each category in the temporal order given — what's secured, what's in motion, what's ahead — without claiming one pursuit caused another.

**Packet-driven conditionality:** The reading compiler starves facts the map cannot support (e.g. no completion spine when nothing is complete). Do not rely on prompt negatives alone — Gemini Flash ignores them.

Schema: `schemaVersion` (`2026-06-11-insights-reading`), `seasonRead`.

### Insights sparkle (per hub / theme / pursuit)

Shown via ✦ on map panels.

**Pursuit ✦** (`insight-types.ts` — `pursuitInsightSchema`): `tone`, `headline`, `body`. Mobile UI: tone pill + bold headline + body. Cross-map links; do not repeat the title; full map JSON in context.

**Theme / hub ✦** (legacy four-field schema): `oneLiner`, `reflective`, `contextual`, `combined`, `tone`.

**Non-duplication rule:** If content could be inferred from the pursuit title alone, cut or replace. Each field must add information the user could not derive by looking at their map.

Tone: direct, informed advisor — not a hype coach.

### Global insight (cache)

The `global` field (`greeting`, `sections`, optional `streamCta`) is a **whole-map compass** kept in the insight cache for API parity. The Insights tab **reading** (`/api/story`) is the live whole-map prose on mobile.

Sections use short titles (e.g. MOMENTUM, ATTENTION). Bodies must be specific, not category weather reports.

### Stream AI interpretation

The `narrativeSentence` and optional pursuit `description` on the confirmation card are the user's first signal that Stream understood them.

- Reflect back what was understood in a way that shows **genuine comprehension** — the *why*, not just the *what*.
- **Bad (receipt):** "Stream understands this as a pursuit about improving your teeth."
- **Good (listening):** "You're working toward fixing your teeth before the wedding — that's going on your map."

Pursuit `description` (1–2 sentences) should reassure through specificity: what success means for this person, using their framing. Not a JSON field summary.

**Map title vs living context (pursuit organization):**

- **Title** (hex label): stable category or outcome — e.g. `Rental income`, `Build emergency fund`. ~3–8 words. No £ amounts, monthly figures, or dates in the title.
- **Description** (Update / pursuit context): latest integrated summary — amounts, targets, progress, nuance. Rewritten on each Update, not appended as duplicate paragraphs.
- **Marks**: one-off timeline moments on the hub; recurring figure changes belong in description unless it's a distinct event.

When the user streams an update with new numbers, **keep or generalize the title** and put the figures in `pursuitUpdates[].description`.

On **Money & Finance** pursuits, Stream Update also syncs `currentAmount` + `unit` from the polished description (e.g. `1650` + `GBP/month`) so Insights reads structured numbers — not just prose. `formatMapContext` passes these fields to every insight/story prompt.

**Three layers (canonical):**

| Layer | Field | Example |
|-------|--------|---------|
| Map label | `title` | Rental income |
| Living context | `description` | Monthly rent £1,650; ~5% gross yield; tenant in place |
| Structured metrics | `currentAmount`, `unit`, `targetAmount` | 1650, GBP/month |
| Timeline moments | hub `marks` | Rent review — raised to £1,700 (Jun 2026) |

Raw brain-dump text is never stored on the goal — one Stream pass produces the polished context block.

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
6. Does sparkle **`contextual`** require **external benchmarks** when age + location are known?
7. Does it forbid **fabricated stats** and require **approximate language**?
8. Does it connect to **identity**, not only productivity?
9. Does it include **negative examples** for the most common failure mode of that surface?

**Story prompt (`generate-story.ts`) also check:**

10. **Ground truth** — only map/profile facts; no invented traits or momentum without evidence.
11. **No diagnostics** — never empty-hub/theme language; Review owns gaps.
12. **No entity duplication** — do not replicate sparkle insight copy or enumerate every pursuit.
13. **Context once** — age, location, occupation at most once per reading.

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
