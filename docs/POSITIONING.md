# Almanac positioning (July 2026)

> **Historical V1 shipped-positioning reference.** The workspace-root Decisions §87–§89 and V2 behavior/memory/non-chatbot specifications define the product now being built. This file remains accurate only for the final V1-style TestFlight experience.

**Status:** rewritten 2026-07-13 to match the shipped product (manual, deliberate chapter creation — no dump/capture feature).
**Companion to** [`../PROJECT.md`](../PROJECT.md) — that file is internal design doctrine (the "one test", the moat, the philosophy). This file is the go-to-market frame.

## What the product is (shipped, July 2026)

A private life map. The user deliberately creates **chapters** on a hex canvas across six **themes** (Finance, Work, Self & Mind, Play & Leisure, People, Health). AI assists *inside* each creation and reflects on the whole:

| Capability | Implementation |
|------------|----------------|
| Structure a typed sentence into a chapter | `/api/goals/parse` (title, date, significance, theme/category) |
| Clarifier questions + suggested milestones on create | `src/lib/pursuit/` enrich pipeline |
| Voice input to text | `/api/transcribe` (Groq) |
| Regenerated insights (chapter / theme / overall) | reflect pipeline, `src/lib/ai/` |
| Chronological record | Timeline (derived view) |

There is no brain-dump or bulk-capture surface. Creation is one chapter at a time, on purpose: the deliberate act of adding a chapter **is** the reflection ([`../PROJECT.md`](../PROJECT.md): "building the record is itself valuable").

## One-liner

> **A save point for your life. You write the chapters; the map shows you the whole story.**

## Target user

The deliberate self-examiner (per [`../PROJECT.md`](../PROJECT.md)): takes personal responsibility seriously, thinks in terms of their whole story, uses tools like Notion but feels something missing, wants self-knowledge to flow inward rather than out to a platform. This is a niche, reachable audience (self-development readers, journaling communities) — treat it as the beachhead, not the ceiling.

## Broadening path (mass-market, without sacrificing the idea)

The niche above is the **first hundred users**, not the identity. You broaden a product by **widening the door, not the positioning statement** — "for everyone" positioning reaches no one. The deep product (honest record, quiet signals, comebacks) stays exactly as built; what changes is which face it leads with.

**Core reframe — lead with the artifact, not the practice.** The mass-market hook was never missing; it was pointed inward. The map and the year-edition are shareable identity artifacts in the lineage of **Spotify Wrapped**, star charts, and personality tests — things millions who would never "journal" happily make and share. "Deliberate self-examination" is work and mainstream users don't buy work; *"see your whole life on one map"* is a payoff.

**The three real blockers to general-public adoption (all fixable without touching the idea):**

1. **Language.** "Self-examination / understand yourself" reads as homework. Lead instead with *story, chapters, map, save point*.
2. **First five minutes.** An empty hex + "write a chapter" is an assignment. Mainstream converts on instant payoff, not promise.
3. **Invisible artifact.** Nothing currently begs to be shown to a friend.

**Broadening moves (priority order):**

1. **Lead with seeing, not writing.** First-touch message: *"See your whole life on one map."* The practice is discovered after the payoff, not required before it.
2. **Onboarding that produces a wow in ~2 minutes.** Guided first session — "add the five biggest things in your life so far" → a populated, beautiful map + one sharp insight. (Volume 0 instinct aimed at acquisition; see the [`../PROJECT.md`](../PROJECT.md) save-point framing.) Seeing *their own life* rendered well in minute two removes the need for any philosophy pitch.
3. **Share export — the viral loop.** "My life as a map" as a gorgeous, optionally anonymized image. Fits the ethos: the user chooses what leaves the app.
4. **Own December — the Wrapped moment.** The Annual/Volume edition is this category's single broadest occasion; already on the roadmap.

**Vocabulary split (first-touch only):** *in* — story, chapters, map, save point. *Out of the shop window, kept for the engine room / niche channels* — self-understanding, examination, the Peterson/Frankl philosophy. This mirrors the `PROJECT.md`-is-internal split the rest of this doc already uses.

**Sequencing caveat.** A broader audience is less forgiving — the niche tolerates roughness because they want the idea; mainstream churns in one session without the wow. So: **niche-first launch** (reachable, patient, and they generate the seasons/stories broad marketing needs), then widen via the share export and the December edition. Niche-first is the on-ramp, not the ceiling.

**Which constraints to lift, which to harden.** Broadening tempts you to relax product rules for reach — but only the *cautious* ones should relax; the ones that *protect the user* must harden as you scale. The pinned decision lives in [`../PROJECT.md`](../PROJECT.md) → "Constraints: which lift, which harden". Short version: **relax how people get in** (guided first-run / wow onboarding — not paste-import; Sketch my map removed §75); **never relax what protects them once inside** (silence never pushes, no streaks/badges/urgency, no AI-invented links).

## Market position

| Neighbor | They have | Almanac's difference |
|----------|-----------|----------------------|
| Goal trackers / task managers | Structure, reminders | Whole-life spatial map; setbacks stay visible as part of the story, not erased |
| Journals (incl. AI journals) | Reflection, entries | Structured, cumulative artifact — chapters with status and milestones, not prose piles |
| Life dashboards / Wheel of Life | Whole-life scope | A living map you build and revisit, with AI insight that reads *across* areas (the hydraulic effect), not a static self-audit |
| ChatGPT as thinking partner | The conversation | A durable, owned, spatial artifact; privacy inversion |

**Honest assessment:** with manual-only creation, Almanac competes in the crowded "intentional life tool" quadrant rather than claiming an open gap. The differentiators are the spatial map, the cross-area insight, and the philosophy of keeping setbacks visible. The moat remains emotional accumulation — a year of honest chapters is not rebuildable elsewhere.

## Known risks (unchanged by feature choices)

- **Acquisition depends on a new behavior.** Deliberate chapter-writing is a habit users must start, not one they already have. Onboarding must reach a meaningful first map fast, and per-chapter AI assist (parse, clarifiers, voice) exists to keep creation cost low.
- **Reflection-app retention curse.** Whole-life tools demo well and retain poorly. The retention bets are the peripheral-vision map and honest-setback mechanics in `PROJECT.md` — unproven; measure them.
- **Name collision.** "Almanac" conflicts with almanac.com and the former Almanac.io. Run trademark / App Store checks before attachment hardens.

## North-star metric

A new user has chapters in **three or more themes within the first week** — evidence the whole-life map (not a single goal) took hold. Secondary: returns to update a chapter status within 14 days.

**Broadening adds two leading indicators** once the moves above ship: **first-session completion** (did the guided onboarding reach a populated map + insight — the 2-minute wow), and **share rate** (fraction who export "my life as a map"). These measure the mass-market door directly; the 3-themes metric measures whether the map took hold once inside.

## Considered and deferred: batched capture ("the dump")

A July 2026 review explored leading with brain-dump capture (voice/text ramble or imported ChatGPT conversation → AI drafts multiple chapters → user curates via confirm queue), positioning Almanac on the existing dump-into-AI behavior. **Decision: not pursued.** The product keeps deliberate, one-at-a-time creation as its identity. Recorded for the future:

- The Stream extractor was deleted in June 2026; a rebuild would be a batched variant of `goals/parse` plus a confirm queue — moderate, not from-scratch.
- If acquisition stalls, an **import-only cold start** (paste a conversation → draft starter map, user curates) is the smallest re-entry point that doesn't change daily use.
- "Stream" is retired vocabulary — do not reuse in UI copy.

## What does not change

- `PROJECT.md` remains the design filter: "does this serve the user's self-understanding — or the platform?"
- The map is the center of gravity and the moat: the longer it's used, the more irreplaceable it becomes.
