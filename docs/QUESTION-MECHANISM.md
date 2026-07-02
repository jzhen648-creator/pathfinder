# Almanac — V2 design concept: The Question Mechanism

**Status:** Design concept, not built. Post-TestFlight. This doc consolidates scattered V2 ideas. After the feasibility audit (2026-06-19), the scope is corrected: the mechanism unifies **three interpretive asks**, not six features. Milestone suggestions, connection lines, significance-weighting, and the richness indicator are **adjacent** to it, not absorbed by it.

**Companion:** the Cursor feasibility audit ([`INSIGHT-ROADMAP-PLAN.md`](./INSIGHT-ROADMAP-PLAN.md) → "V2 — Unified Question Mechanism") is the source of truth for what fits and what doesn't. Read it before building anything here.

---

## The one idea (correctly scoped)

**For interpretive asks, the AI proposes as a quiet question. The user confirms. Confirmed answers either enrich the map/readings or launch a normal user-authored action.**

"Interpretive asks" means exactly three things: **clarify** (what does this pursuit mean), **connect** (is this related to that), and **suggest-add** (want to add this pursuit). These three share **one user-facing gesture and one card type** — a quiet question you tap.

They do **not** share one storage path. This is the important subtlety: it is **one gesture with three handlers**, not one pipeline.

| Ask | Confirm handler | Where the answer goes |
|-----|-----------------|----------------------|
| **Clarify** | Save user-stated context | Today: `description` / `enrichAnswers`; target storage depends on the Pursuit Context Log decision |
| **Connect** | Record a relationship | **Open decision** — needs queryable structure, not a prose line (see Open Decisions) |
| **Suggest-add** | Open create flow | Nothing is "answered" unless provenance is chosen — opens `PlacementCreateSheet` prefilled; user authors it |

That shared gesture is the real, defensible simplification. It is **not** "everything becomes a question" — the audit showed that forcing milestones, map lines, selection logic, and a read-only meter into this pathway would *increase* complexity, not reduce it.

The product already has the verb the user understands: a small question appears, you tap an answer, your map gets smarter. Today that verb only does title clarification. The concept here is to make that *same gesture* carry more of the app's intelligence — without adding new features the user has to learn separately.

Why this fits Almanac specifically:

- It keeps the user as the author. The AI never inserts a pursuit, a connection, or a fact — it *asks*, and only a confirmation makes anything real. This protects "the map is your truth."
- It is one quiet recurring gesture, not a dashboard of capabilities. That is consistent with "focus on what matters, ignore the noise."
- It gets smarter the more of your life is in it — the questions sharpen as the map fills. That is the moat.

### Cursor opinion

This improves Almanac **if it stays this narrow**. The product gain is coherence: the user learns one small gesture for "Almanac wants to understand something," while the app preserves the authorship rule that makes the map feel truthful.

Recommended default, unless TestFlight says otherwise: finish question predictability first; make the Pursuit Context Log the prerequisite; use a typed peer relationship for Connect; let Suggest-add open create with optional provenance; do **not** ship connection lines by default. Lines can wait until the data proves useful without them.

---

## What is inside the mechanism vs adjacent to it

The audit's verdict, made concrete:

### Inside — the three interpretive asks (one shared card)

| Ask | The question | On confirm |
|-----|--------------|------------|
| **Clarify** (exists today) | "What does this pursuit refer to?" | Answer appends to context; sharpens next reading |
| **Connect** | "Is clearing this debt connected to your wedding planning?" | A relationship is recorded as structured user-stated context |
| **Suggest-add** | "You finished CeMAP — add 'apply for mortgage broker roles'?" | Opens the normal create flow, prefilled. Never auto-placed. |

These three collapse into one card type and one learning curve for the user — with **three confirm handlers** behind it.

### Adjacent — shares the philosophy, NOT the pipeline

| Idea | Why it stays separate |
|------|----------------------|
| **Milestone suggestions** | Already a sibling pattern with a different accept UX (suggestion chips on the pursuit sheet). Same "AI proposes, user accepts" spirit, different component. Shoehorning into a question card adds complexity. |
| **Connection lines on the map** | A *visual* layer. The connection *data* comes from the Connect question; whether a *line* is ever drawn is a separate renderer decision that must independently clear the constellation-not-graph bar. May never happen. Decoupled. |
| **Significance-as-gravity** | Selection logic *upstream* of questions — it decides *which* pursuit's questions are worth asking first. Not a card type; a sort key before batching. |
| **Richness indicator** | Read-only surfacing of existing signals. It can share math with the question-frequency gate, but it is not itself a question. |

The discipline here is the simplification: three things merge, four things stay themselves. Resisting the urge to absorb everything is what keeps it simple.

---

## The user experience (target)

1. The user lives in the app — adds pursuits, sets significance, logs milestones.
2. Now and then, a small question appears on a pursuit (or at a natural moment like a completion). Calm, single, skippable. Multiple-choice, with honest escape options ("Not sure," "Unrelated," "No thanks").
3. Answering takes one tap and visibly makes the next reading sharper.
4. The questions feel *intentional* — the user can sense why this one is being asked (this pursuit is thin; this one just completed; this one sits next to something important).
5. Nothing is ever placed, linked, or asserted without the user's tap.

What it must never become: a chatty coach, a form, an interrogation, a feature the user has to manage. One quiet gesture.

---

## Open decisions (for after the audit)

These are flagged, not answered. The feasibility audit informs them; the founder decides.

1. **Persistence paths — the central decision.** The three asks have three handlers, so confirmed answers may land in three places. This collides with an already-planned project: the **Pursuit Context Log** is the first post-TestFlight backend effort *specifically because* clarifier answers currently append to overwrite-prone `description`. Before building the Connect ask, decide: do all QQ answers migrate into the context log (and `description` becomes derived/display)? Or do question *types* write to different stores (clarify → `enrichAnswers`; connect → typed relationship; suggest-add → create flow only)? This decision gates the Connect and Suggest-add asks and must be made first. (Audit Part 2B; Decisions Log §6.)
2. **Connection data store.** If connections become real, where: typed `enrichAnswers` entry with `peerGoalId`, a minimal `PursuitRelationship` table (peers, not trees), or context-log entries? Sub-question of decision 1. Decoupled from any visual line.
3. **Connection lines — separate gate.** Even with connection data, do lines ever get drawn? They conflict with the constellation north star. A *visual* decision made on its own merits, later, possibly never. The data is valuable without them.
4. **Suggestion provenance.** If a suggested pursuit is accepted, do we record it came from completing CeMAP (`createdFrom`)? Useful for "painting a picture" of a continuous life; costs a schema field. (Audit Part 2A.)
5. **Question selection + frequency.** Replace LLM-discretion with a deterministic scorer (thin + high-significance + just-completed picks the moment and pursuit; model only drafts the MC copy). Phase 2.5 work — partially shipped (see audit). Tune frequency with real testers.
6. **Does everything actually fit?** Answered by the audit: three asks fit the gesture; milestones, lines, significance-logic, and the richness meter stay adjacent. Don't re-absorb them.

---

## Hard constraints (inherited, non-negotiable)

- **No AI on create.** A suggestion is a post-sync question; the user confirms and creates. The AI never originates a pursuit on the map.
- **Peers, not trees.** Connections are lateral relationships, not parent/child nesting.
- **No unconfirmed succession as fact.** A relationship is only asserted in prose after the user confirms it.
- **Locked taxonomy.** Any suggested pursuit must map to a valid theme + category slot.
- **Constellation, not network graph.** Connection *data* is fine; connection *lines* must independently earn their place against the calm-field aesthetic.

---

## Sequencing

This entire doc is **post-TestFlight**. The pre-TestFlight build (trust fix + layering boundary + QQ clarity) shipped and Phase 0 is verified on production. Friends testing the app will tell us whether the Question Mechanism is delightful or annoying far better than further design can. Use it first, then decide how far to take it.

**Prerequisite, separable from this doc:** the audit found the current Quick Question pathway felt *unpredictable* for reasons that are pure mechanics — a hidden richness off-switch and FIFO-style batching before significance-aware sorting landed. Making questions feel *intentional* is a cheap, schema-free fix (see "Phase 2.5 — Predictable Quick Questions" in the roadmap) and is a sensible foundation to lay *before* building the Connect and Suggest-add asks on top. A pathway that already feels deliberate is a much better base than one that feels random.

Build order, once greenlit post-validation, set by the feasibility audit:

1. **Phase 2.5 (predictability)** — align the clarifier gate with richness, significance-aware ordering, completion boost, and why-now cue on the pursuit sheet. Schema-free. Makes today's Clarify ask feel intentional. *(Shipped — see audit.)*
2. **Connect ask** — connection question → structured confirmed relationship (data only, no lines).
3. **Suggest-add ask** — completion/beat → "add this?" → prefilled create flow.
4. **Adjacent, independent decisions** — connection lines (visual, may never), richness indicator UI (founder confirm — design previously parked it), question-type selection + frequency tuning (remaining Phase 2.5).
