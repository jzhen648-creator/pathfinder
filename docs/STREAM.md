# Stream — Feature Specification

*Reconciled with repo: 2026-05-19. See [`DECISIONS.md`](../DECISIONS.md) and [`CHANGELOG.md`](../CHANGELOG.md) for dated engineering notes.*

## What Stream is

Stream is the primary input surface for Pathfinder.

The user has a natural conversation — they talk about what they've been doing, what they're working on,
what they're thinking about. The AI listens, reasons about what already exists in their map, and
extracts only what is new: a pursuit for what they're working toward, a timeline note for what's done,
a milestone for a step within a pursuit, or an update to an existing pursuit.

One confirmation card at a time for structured items. Nothing committed until the user confirms or skips.

Stream is not a feature bolted onto a goal-entry form. It *is* the entry form — replaced entirely.
The original insight: nobody wants to open a dropdown to categorise a moment in their life.
Stream removes that moment completely.

**Entry points:** **Open Stream** on the theme, hub, or pursuit panel (one button per panel; no duplicate chips or links).

---

## Design principles

**Context-first extraction.** Before proposing anything, the AI reads the user's existing map (and for theme Stream, prior session dumps when available). It completes what exists before creating anything new. If a pursuit already exists for the topic being discussed, it adds a milestone or timeline note — or updates the pursuit title/status — rather than creating a duplicate.

**One card at a time.** The confirmation screen presents a single structured item. No bulk import, no multi-select.

**Nothing saved until confirmed (structured items).** Preview nodes appear on the tree in a dimmer, pulsing state while the Stream session is active. Confirming a card commits via **`POST /api/stream/commit`** and transitions preview nodes to full brightness.

**Ambiguity surfaces on the tree, not in the queue.** Items the AI is uncertain about are committed immediately as **`Mark`** rows with `needsResolution: true` (dashed marker on the map). The user resolves them on the tree (**Done / In progress / Not started**) or via `POST /api/stream/resolve-ambiguous` — not via another confirmation card. The queue shows an informational banner only.

**Edit map is disabled during Stream.** Pan is re-enabled when the session ends.

---

## Confirmation card types

| Kind | What it represents | Commit |
|------|-------------------|--------|
| **Pursuit** | New goal on a hub, **or** update to existing (`existingGoalId` — richer title, pause, resume, complete) | `POST /api/stream/commit` |
| **Mark** | Timeline note (title + date + notes — no type field) | same |
| **Milestone** | Step within an existing pursuit | same |
| **Ambiguous** | Not a card — committed on extract as unresolved mark | `stream-commit-ambiguous.ts` on extract |

There is no separate **Embellishment** card type: embellishments are **pursuit** cards with `existingGoalId` and unchanged or updated `bloomStatus`.

**REORGANISE** *(V3, deferred)* — AI-proposed restructuring of existing map data. Not built. Do not build before V2 is stable.

---

## Hierarchy inference

The AI must determine where each extracted item belongs:
which theme → which hub → which pursuit (if applicable).

### V1 — Single-session inference *(current)*

Within a single Stream session, the AI tracks what has been confirmed so far and uses it
as context for subsequent cards (`clientKey` / `parentRef` for new pursuits in the same dump).

Hub placement uses content plus the hub catalog (`src/lib/hub-catalog.ts`, `aiRoutingNote`).
Low-confidence placements should land in **ambiguous[]**, not wrong hubs.

### V2 — Cross-session context *(partial)*

**Theme Stream:** `StreamSession` stores prior dumps; theme extract loads the last few sessions into `buildStreamThemeContextInput` for dedup and continuity.

**Hub Stream:** session summary string per hub (`previousStreamSessionSummary`) — lighter than full theme context.

Full semantic “map memory” across all hubs is still evolving; treat V2 as **foundation shipped**, not finished.

### V3 — Retroactive map reorganisation *(deferred)*

Merge duplicates, move marks, suggest hub changes — via future REORGANISE flow. Requires rich map data and stable V2.

---

## Technical architecture

```
User input (text; voice planned)
  → POST /api/stream/extract
    → src/lib/ai/stream-extract.ts
      → Load map context (GET /api/branches / theme context builder)
      → Hub catalog + aiRoutingNote
      → LLM: narrativeSentence, pursuits, marks, milestones, ambiguous[], itemOrder
    → Client: StreamConfirmation card queue
      → Preview nodes on tree (stream-preview-context, dimmer + pulse)
      → Ambiguous: commit on extract → reload tree
  → User confirms/skips each structured card
    → POST /api/stream/commit
  → Optional: POST /api/stream/enrich (sparse titles)
  → Session ends → clear previews, edit map re-enabled
```

**Key modules:** `src/components/stream/`, `src/lib/stream-commit.ts`, `src/lib/stream-commit-ambiguous.ts`, `src/types/stream.ts`.

**Preview nodes:** `staged` via preview layer — ~45% opacity, pulse animation, no panel open while preview-only. Pending card uses stronger pulse (`PREVIEW_PENDING_NODE_ID`).

---

## Prompt engineering notes

The extraction prompt must:

1. Receive existing map context (and theme prior sessions when applicable) before extracting
2. Prioritise completing/updating existing pursuits over creating new ones
3. Never create a pursuit when only a timeline note is warranted (and vice versa)
4. Use **ambiguous[]** when hub or status is unclear — do not guess into wrong hubs
5. Extract one semantic item per confirmation card — `itemOrder` drives queue sequence
6. Use canonical hub slugs from `hub-catalog.ts`
7. Not invent milestone structures unless the user described steps (user-named methods/treatments → milestones; do not fabricate phases)
8. Marks: title, date, notes only — hub-scoped, never `pursuitRef`
9. Status-only dumps: map to `existingGoalId` + `ACTIVE` / `ON_HOLD` / `COMPLETE` — no duplicate pursuit rows
10. Pursuit titles: distilled plain language (~3–8 words); procedures and methods → milestones, not packed into the pursuit title
11. Subset/method overlap on a hub → milestone on existing pursuit, not a duplicate peer pursuit

Drift between hub catalog and prompts is a known regression risk — update both when taxonomy changes.

---

## What Stream replaced

The Evolve API and fork flow were removed in May 2026. Stream replaces them for new pursuits, marks, and milestones.

Do not resurrect Evolve or fork UX. `Goal.parentGoalId` remains for **legacy layout/display** only.

---

## Known constraints

- **Mark placement:** Hub-level on branch sequence; lateral offset beside ray (`branchMarkScreenPosition`). Stream-created marks use hub anchors by default.
- **Edit map:** Disabled during active Stream (`tree-view.tsx`).
- **Session persistence:** Unconfirmed preview nodes are discarded if the user leaves mid-session.
- **Voice input:** Designed for voice; transcription not fully wired yet.
- **Multi-hub sessions:** One theme/hub extract can span multiple hubs; confirmation is still card-by-card.

---

## Related docs

- [`../docs/archive/VISION.md`](../docs/archive/VISION.md) — historical product north star
- [`../BRIEF.md`](../BRIEF.md) — short Stream + tree summary
- [`../DECISIONS.md`](../DECISIONS.md) — ambiguous-on-tree, edit map, Evolve removal
- [`architecture.md`](./architecture.md) — system mental model
