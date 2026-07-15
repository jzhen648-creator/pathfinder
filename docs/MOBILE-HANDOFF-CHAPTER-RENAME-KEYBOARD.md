# Mobile handoff — chapter rename box hidden behind keyboard (device-specific)

**Audience:** the Cursor agent working in `pathfinder-mobile/`.
**Written:** 2026-07-15. **Backend:** no change needed — this is a client-only rendering bug.
**Severity:** major — on affected devices the chapter **title cannot be edited at all**.

---

## Symptom (from the field report)

Tap a chapter's **title** in the detail panel to rename it → the keyboard rises → **but there is no visible text box to type into.** The title stays in its display position, the keyboard covers the bottom of the sheet, and there is nowhere to edit. "Done" dismisses the keyboard with no change.

Reported on an iPhone **other than** the 15 Pro Max. On the 15 Pro Max (primary test device) the rename box **is** visible and works. That device split is the biggest clue — see root cause.

## What this is NOT (don't chase these)

- **Not the "simple chapter creation" decision.** The screen in the report is an **existing** chapter's detail panel (Status: Active, dates set) using **tap-to-edit rename**, shipped 2026-06-20 (`DECISIONS.md` → *"Pursuit detail panel supports tap-to-edit in place"*). It is a different code path from the create form. Chapter **creation** is unchanged (`DECISIONS.md` 2026-06-11 — *"Creation mode unchanged"*) and still has its own title field. Do not touch the create flow for this bug.
- **Not the backend.** `PATCH /api/goals/[goalId]` accepts a `title` change and persists it (`pathfinder/src/app/api/goals/[goalId]/route.ts:79–106`). The keyboard even rises, which means a `TextInput` **is** being focused — the field exists, it just isn't on screen. Nothing to fix server-side.

## Root cause (hypothesis — verify on a non-Pro-Max simulator)

Tap-to-edit renders the **same** editor long-press uses: `MapNodeContextMenu` with `layout="centered"` and `initialSubview="rename"`, opened from `PursuitDetailPanel`, with all mutations flowing through `usePursuitFieldMutations` (per `DECISIONS.md` 2026-06-20).

The `layout="centered"` sheet almost certainly renders **without keyboard avoidance** — no `KeyboardAvoidingView` / keyboard offset, and/or a fixed vertical center that assumes a tall viewport. When the keyboard opens:

- On the **15 Pro Max** (932pt tall) the centered rename `TextInput` still sits above the keyboard → looks fine.
- On a **shorter / smaller iPhone** (e.g. non-Max, SE, mini, or any device with different safe-area insets) the centered input lands **behind the keyboard** or is clipped off the bottom of the sheet → invisible, exactly as reported.

This is why it reproduces for the other tester and not for you: it's viewport-height / safe-area dependent, not a logic bug.

## How to reproduce

1. Run the app on an iPhone **that is not the Pro Max** — a shorter simulator is enough (e.g. iPhone SE, 13 mini, or a standard non-Max) and reproduces most reliably.
2. Open any existing chapter's detail panel.
3. Tap the **title** to rename.
4. Observe: keyboard rises, no editable box appears above it. Compare against a 15 Pro Max simulator where it works.

## Suggested fix (client — `pathfinder-mobile/`)

Search for the `MapNodeContextMenu` centered layout and its rename subview. Likely fixes, cheapest first:

1. **Keyboard-avoid the centered sheet.** Wrap the centered `MapNodeContextMenu` content in `KeyboardAvoidingView` (`behavior="padding"` on iOS) *or* use the app's existing keyboard-aware sheet/bottom-sheet primitive so the rename `TextInput` is pushed above the keyboard on every device height.
2. **Anchor the rename subview to the top of the sheet instead of vertically centering it** when its subview contains a focused input — a centered modal + keyboard is the fragile combination. The rename field should sit near the top so keyboard height never occludes it.
3. **Guarantee the focused input scrolls into view** — if the sheet content is scrollable, `TextInput.onFocus` should scroll the field above the keyboard inset (use `useSafeAreaInsets()` + keyboard height, not hardcoded offsets).
4. **Regression-check the other tap-to-edit subviews** opened the same way (`initialSubview` = category / status / date / significance / icon pickers). The rename `TextInput` is the acute case, but any subview whose interactive controls sit low in a centered sheet has the same occlusion risk on short devices. Long-press on the map opens the identical component, so verify both entry points.

Keep tap and long-press on the identical handler/cache/dirty path (the 2026-06-20 decision explicitly requires they cannot diverge) — fix the shared component, not one call site.

## Acceptance

- Renaming a chapter title works on a **short-viewport** iPhone (SE / mini / non-Max) and on the 15 Pro Max: tapping the title shows an editable box **above** the keyboard, typing updates it, and the change persists via `PATCH /api/goals/[goalId]`.
- The other centered tap-to-edit subviews remain reachable with the keyboard open where they take input.
- No change to the chapter creation flow.

## Add to `TERMINOLOGY.md`?

No new user-facing strings — this is layout only. No copy changes.
