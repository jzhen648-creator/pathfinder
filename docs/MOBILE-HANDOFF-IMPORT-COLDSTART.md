# Mobile handoff — import cold-start (paste/talk → starter map)

**Audience:** the Cursor agent working in `pathfinder-mobile/`.
**Written:** 2026-07-14. Backend shipped in `pathfinder` PR #13 (`POST /api/goals/import-draft`).
**Depends on:** the existing chapter-create flow and (optional) `/api/transcribe` voice-to-text, both already in the app.

---

## Why this exists (read once)

The #1 blocker to mainstream adoption is the **empty first five minutes**: a blank hex map + "write a chapter" is homework. This feature lets a new user **paste a conversation (e.g. from ChatGPT) or talk for ~30 seconds**, and get a **starter map drafted for them** — which they then curate. It is the pinned "LIFT" constraint in [`../PROJECT.md`](../PROJECT.md) → *Constraints: which lift, which harden*: **relax how people get IN; never relax what protects them once inside.**

**The non-negotiable line:** this is a *draft-and-curate* flow, NOT auto-import. Nothing lands on the map until the user confirms it, one chapter at a time. The AI proposes; the user authors. If you find yourself bulk-inserting chapters without a per-chapter confirm, stop — that violates the doctrine.

## Design contract

1. **User stays the author.** Every drafted chapter is reviewed and confirmed (or edited, or discarded) individually before it becomes real. No "import all" that skips review.
2. **Drafts are suggestions, not facts.** Present them as "here's what we heard — keep what's right." Easy to discard, easy to edit title/theme before keeping.
3. **No invention surfaced.** The backend already drops invented themes and empty titles; don't re-add anything that fabricates. Never invent links between chapters (hardened constraint).
4. **Vocabulary:** user word is **chapter**; themes are the six on the map. Never "goal/pursuit/dump/stream" in UI copy. (See `TERMINOLOGY.md` — add any new strings there.)
5. **Calm, not gamified.** No confetti, no "You added 8 chapters!" score. The reward is *seeing their life on the map*, which the map itself provides.

## API contract

**`POST /api/goals/import-draft`** (session-authenticated; same auth as other goal routes)

Request:
```json
{ "text": "free text — a pasted conversation, notes, or a transcript (max 20000 chars)" }
```

Response `200`:
```json
{ "chapters": [
  { "title": "Clear the credit card debt", "themeId": "finance", "significance": 3, "targetDate": null, "confidence": 0.9 },
  { "title": "Run the London Marathon", "themeId": "health", "significance": 3, "targetDate": "2027-04-26", "confidence": 0.7 }
] }
```

- `themeId` is always one of the six real theme ids (`finance`, `work`, `becoming`, `pleasures`, `people`, `health`). Invalid/invented themes are already filtered server-side.
- `significance` is 1–3. `targetDate` is an ISO `YYYY-MM-DD` or `null`. `confidence` is 0–1 (use it to sort or soft-flag low-confidence drafts; do not hide them by default).
- `chapters` may be empty (vague input) — handle gracefully with a "we couldn't find clear chapters — try adding a bit more" state.

Error statuses to handle: `400` (bad/empty body), `429` (rate-limited — "one moment, try again"), `503` (AI not configured — hide the feature or show unavailable), `502` (transient AI failure — offer retry).

**Stateless:** this endpoint saves nothing. Keeping a draft = calling the **existing create-chapter path** with that chapter's fields (title, themeId, significance, targetDate). Reuse it; do not write a new persistence path. `becoming`'s display label is "Self & Mind".

## The flow to build

1. **Entry point — onboarding first.** After account creation, before the empty map, offer: *"Start with what's already on your mind — paste a conversation or talk for a moment, and we'll sketch your map."* Also reachable later from an empty-map affordance. Skippable (blank map + manual `+` remains valid).
2. **Input screen.** A large text field (paste target) and/or a mic button reusing `/api/transcribe` (voice → text → same field). One primary action: "Sketch my map".
3. **Loading.** One call; can take a few seconds. Calm progress ("Reading…"), not a spinner-of-doom.
4. **Review queue.** Show the drafted chapters as a reviewable list/cards. Per chapter: keep / edit (title + theme at minimum) / discard. Optionally group by theme so the user sees the map taking shape. Low-`confidence` items can be visually softer but stay visible.
5. **Commit.** "Keep" runs the existing create flow per confirmed chapter. Then land the user on their now-populated map — that arrival is the payoff.

## Acceptance criteria

- Paste a few paragraphs of real-ish life text → several sensible drafted chapters appear, each on a real theme.
- Every kept chapter went through an explicit per-chapter confirm; discards never persist.
- Empty/garbage input → graceful "nothing clear found" state, no crash.
- `429/502/503` each show a calm, correct message; `503` never leaves a dead button.
- Skipping the whole flow leaves a normal empty map + working manual `+`.
- Committed chapters are indistinguishable from manually-created ones (same create path) — they get insights, quiet signals, seasons, everything.
- `npx tsc --noEmit` clean in `pathfinder-mobile`; copy checked against `TERMINOLOGY.md`; verified on device via Expo Go (screenshots in PR).

## Out of scope — do not build

- Auto-import / "add all without review" (violates the authorship doctrine).
- Any server-side persistence in this feature (the endpoint is stateless by design).
- Streaks, counts, or celebratory scoring of how many chapters were added.
- Re-deriving or second-guessing themes client-side — trust the server's `themeId`.
- Connections/relationships between drafted chapters (hardened constraint: no AI-invented links).

## Definition of done

Per-chapter confirm enforced · onboarding entry + skippable · all four error states handled · empty-result state · `tsc` clean · device-verified with screenshots · pushed. Then it's the same "relax the door, not the protections" principle, shipped.
