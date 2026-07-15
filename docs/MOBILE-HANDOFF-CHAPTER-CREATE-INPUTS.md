# Mobile handoff — restore visible chapter create inputs

**Audience:** the Cursor agent working in `pathfinder-mobile/`.
**Written:** 2026-07-15. API support shipped in `pathfinder` (this repo) on branch `cursor/chapter-create-visible-inputs-c264`.
**Depends on:** existing `+` / Build-here create flow and chapter detail panel rename path.

---

## Why this exists

Dogfood on iPhone (multiple devices) hit the same failure: **no obvious box to type the chapter title** during create, and several details felt uneditable. That is not an iPhone-model bug.

Create was simplified into a **review card of chevron rows** (tap → sheet). Title and notes were no longer always-visible `TextInput`s. That cut was a mistake for the primary authoring moment: naming a chapter.

**Product ruling for this pass:** restore **typed fields for title + notes** (and measurable amounts when relevant). Keep pickers for theme/category, status, significance, dates if those already work as sheets.

---

## Design contract

1. **Title is always a text field on create.** User can type immediately — no tap-`>`-then-rename detour required to name the chapter.
2. **Notes / background is always a multiline field on create** (optional). Persists as `background` on `POST /api/goals` (API accepts it now).
3. **Pickers stay pickers** for theme/category, status, significance, dates — unless those sheets themselves are broken (then fix focus + keyboard avoidance).
4. **Measurable target** (amount / unit / current) must use real inputs when the toggle is on — not display-only rows.
5. **Vocabulary:** UI word is **chapter**. Never “goal/pursuit” in user copy. See `TERMINOLOGY.md`.
6. **Detail panel rename:** after create, tapping title must open a sheet with a **visible, focused `TextInput`** (keyboard + field both on screen). Same for notes/background edit.

---

## API contract (already updated in pathfinder)

### `POST /api/goals` — additive fields

```json
{
  "title": "Lose 20kg",
  "description": "",
  "categoryId": "…",
  "goalType": "project",
  "deadline": "2027-02-10",
  "timelineStart": "2026-08-10",
  "hasMeasurableTarget": true,
  "targetAmount": "20",
  "currentAmount": "0",
  "unit": "kg",
  "background": "Training starts mid-August.",
  "iconName": "dumbbell",
  "significance": 2,
  "status": "ACTIVE"
}
```

- `background` — optional, max 1000 chars; user-authored; AI reads, never writes.
- `iconName` — optional Lucide kebab slug from the picker; omit for theme fallback.
- **201 response** now returns a fuller `goal` object (id, title, description, background, iconName, status, significance, deadline, timelineStart, completedAt, amounts, categoryId, themeId) so the client can update cache without a missing-field wipe.

### `PATCH /api/goals/[goalId]`

- Unchanged request shape (`title`, `background`, dates, amounts, etc.).
- Response `goal` select now includes `background`, `deadline`, `timelineStart`, amounts, `themeId` — so merge-into-cache after rename/edit does not drop notes or dates.

---

## Surfaces to change (mobile)

| Surface | Likely files (names from DECISIONS — verify in repo) | Change |
|---------|------------------------------------------------------|--------|
| Create sheet / Build here | `PlacementCreateSheet`, create overview/review step | Replace title chevron row with controlled `TextInput`; add multiline notes → `background` |
| Create measurable block | same create form | Ensure amount/unit inputs are focussable `TextInput`s |
| Keyboard | create + rename sheets | `KeyboardAvoidingView` / scroll-to-focused-input — **must** work on both Pro Max and shorter iPhones |
| Detail rename | `PursuitDetailPanel` → `MapNodeContextMenu` rename subview | Autofocus visible text field; never open keyboard with no visible box |
| Mutations | `usePursuitFieldMutations` / create mutation | Send `background` + `iconName` on create; merge fuller POST/PATCH responses into query cache |

Entry points to keep in sync: map utility **`+`** and long-press **Build here**. Do not leave one path on the old review-only UI.

---

## Acceptance criteria (device)

- [ ] Create: typing starts in a visible title field with no prior `>` tap
- [ ] Create: optional notes save and appear when the chapter is opened
- [ ] Create: with measurable on, can enter target amount + unit
- [ ] Create: start / target dates still settable
- [ ] Detail: rename title shows a clear text box + keyboard; field not under keyboard
- [ ] Same results on iPhone 15 Pro Max and a shorter iPhone

---

## Out of scope

- Reintroducing Stream / global dump
- Full multi-step wizard rollback
- Connect / Suggest-add / Profile Memory
- Desktop tree UI

## What not to do

- Do not “fix” missing typing by adding more chevrons or coachmarks — restore the inputs
- Do not auto-place AI draft text without user confirmation (import cold-start remains draft-and-curate)
- Do not invent API fields — use `background` / `iconName` / existing create payload keys only
