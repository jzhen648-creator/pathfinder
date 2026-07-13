# Almanac positioning (July 2026)

**Status:** adopted framing from market-gap review, 2026-07-13.
**Companion to** [`../PROJECT.md`](../PROJECT.md) — that file is internal design doctrine (the "one test", the moat, the philosophy). This file is the go-to-market frame. The philosophy stays out of public copy.

## One-liner

> **You already think out loud to AI. Almanac turns those dumps into a living map of your life.**

Position on the behavior, not the philosophy. The claim is concrete, differentiated, and testable.

## The wedge and the destination

The ambition does not shrink — the **sequencing** changes.

| | |
|--|--|
| **Destination** (unchanged) | The full life map: a private, cumulative save point for your story ([`../PROJECT.md`](../PROJECT.md)). |
| **Wedge** (new lead) | Intercept an existing behavior. People already dump fears, plans, and goals into ChatGPT/Claude and nothing durable comes out the other side. Almanac is where the dump lands. |
| **Rule** | Never ask a new user to start a behavior on day one. The map is the destination; the dump is the door. |
| **Capture principle** | **Messy in, neat out, human in the loop.** The dump is raw material only — AI drafts, the user curates. Nothing lands on the map without the user deliberately confirming, editing, or naming it. The reflective act (`PROJECT.md`: "building the record is itself valuable") lives in the curation step, not the typing. Chapters stay neat *because* of capture, not despite it. |

**Why not lead with the map:** whole-life dashboards (Wheel of Life apps, "Life OS" templates) are a graveyard category — they demo well and retain poorly because they depend on a new manual habit. The dump wedge rides a habit that already exists.

## Target user — behavioral, not psychographic

Defined by what they **already do**, not who they are:

- Processes life decisions, anxieties, and plans in AI chat conversations.
- Records rambling voice notes or morning-pages-style text with no home for the output.
- Has months of ChatGPT history containing their actual goals — unretrievable, unstructured.

The Peterson/Frankl reader profile in `PROJECT.md` remains a useful early-adopter *channel*, not the market definition.

## Market landscape (as of early 2026)

| Neighbor | Has | Lacks |
|----------|-----|-------|
| AI journals (Rosebud, Mindsera, Stoic) | Extraction, reflection prompts | Life-wide structured artifact; spatial view |
| ChatGPT memory / projects | The dump itself, durable-ish recall | An artifact the user owns; structure; whole-life view |
| Goal trackers / task managers | Structure | Whole-life scope; capture from unstructured input |
| Life dashboards / Wheel of Life | Whole-life scope | Automatic capture; retention (habit-dependent) |

**The open intersection:** a structured, spatial, cumulative, private artifact produced from unstructured AI conversation. Chat apps have memory but no artifact; journals have entries but no structure; trackers have structure but no life-wide view.

**The standing threat:** each neighbor can extend inward, and ChatGPT memory attacks from above. The defense is the thing they can't be — a spatial artifact that belongs to the user and compounds. AI extraction alone is table stakes, not the moat.

## What this changes in product priorities

1. **Dump becomes the primary input verb on mobile.** The front-door action is capture (voice/text), not **+** add chapter. Manual creation stays as the secondary path. Backend status (verified 2026-07): the multi-item Stream extractor was **deleted** with the June 2026 retirement (`stream-extract.ts`, `goals/chat` now 410) — but voice transcription (`/api/transcribe`), single-statement parsing (`/api/goals/parse`), and the create-enrich/clarifier pipeline are all live. The rebuild is a **batched extractor** (dump → N items + status updates + ambiguous leftovers) plus a confirm-card queue — a new prompt/schema/route on existing plumbing, not a from-scratch subsystem. (User-facing name for this verb: TBD — "Stream" is retired vocabulary; do not reuse it in UI copy.)
2. **Cold start via import, not onboarding questions.** New user pastes or shares a ChatGPT/Claude conversation → Almanac extracts a starter map. Delivers the whole pitch in the first two minutes and self-selects the target user (only people with dumps have anything to import). Mobile share-sheet target is the follow-on.
3. **North-star metric:** a user returns with a **second unprompted dump within 7 days**. Not map completeness, not insight quality. If the dump behavior doesn't transfer, nothing downstream matters.
4. **Reclassify depth work.** Taxonomy refinement, insight-prose tuning, edit-map reorder are retention/depth features — they stay on the backlog but none of them acquire a user. Acquisition work (items 1–2) leads.

## Validate before building

Concierge test, ~1 week, no shipping required: find ten people who already use ChatGPT as a thinking partner, run one of their real dumps through a standalone extraction script (a batched variant of the `goals/parse` prompt — no product code needed), show them their map.

- "Huh, neat" → a demo.
- "Wait, can I add more to this?" → the business.

## Landing copy candidates

- *You already think out loud to AI. Now it goes somewhere.*
- *Your AI conversations, turned into a map of your life.*
- *Every dump becomes a chapter. Every chapter stays on the map.*
- Retain from `PROJECT.md` for the philosophy-aware channel only: *Understand yourself before the algorithm does.*

## Known risks

- **ChatGPT memory gets "good enough"** and the dump never leaves the chat app. Mitigation: the owned, spatial, shareable artifact; privacy inversion.
- **Reflection-app retention curse.** The wedge fixes acquisition, not avoidance; the peripheral-vision map mechanics (`PROJECT.md`) remain the retention bet and are unproven.
- **Name collision.** "Almanac" conflicts with almanac.com and the former Almanac.io. Run trademark / App Store checks before attachment hardens.

## What does not change

- `PROJECT.md` remains the internal design filter ("does this serve the user's self-understanding — or the platform?").
- The map remains the product's center of gravity and the moat. It stops being the *lead* and becomes the thing users discover they can't leave.
