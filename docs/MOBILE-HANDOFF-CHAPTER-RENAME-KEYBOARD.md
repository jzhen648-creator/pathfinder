# Mobile note — chapter rename box hidden behind keyboard (device-specific)

**Audience:** anyone touching the chapter field-edit sheets in `pathfinder-mobile/`.
**Written:** 2026-07-15. **Status:** fix pushed in `pathfinder-workspace` PR #1 (`claude/chapter-rename-keyboard-fix`) — awaiting on-device verification.
**Backend:** no change — this was a client-only rendering bug.

---

## Symptom

Tap a chapter's **title** in the detail panel to rename it → the keyboard rises → **but there is no visible text box to type into.** Reported on an iPhone other than the 15 Pro Max; works on the Pro Max. Title cannot be edited on affected devices.

## What it is NOT (avoided dead ends)

- **Not the "simple chapter creation" decision.** This is the tap-to-edit rename on an **existing** chapter, not the create form. Different code path.
- **Not `MapNodeContextMenu` / `initialSubview`.** The 2026-06-20 DECISIONS.md entry ("tap-to-edit via `MapNodeContextMenu` `initialSubview`") is **stale** — field editing has since moved off the map menu onto the chapter page. `MapNodeContextMenu` now only carries Open / Move / Icon / Archive quick actions and has no rename input (see its header comment: *"field editing lives on the chapter page"*).
- **Not the backend.** `pathfinder/src/app/api/goals/[goalId]/route.ts` accepts a `title` PATCH fine. The keyboard even rises, so a `TextInput` **is** mounting and focusing — the field exists, it's just occluded.

## Real code path

`PursuitDetailPanel` (chapter page) → `onPressTitle` → `setEditField("rename")` → `PursuitFieldEditor` (`field="rename"`) → `CompactFieldSheet` (`keyboardAnchored`) rendering a `SheetAwareTextInput` → `BottomSheetTextInput` (`autoFocus`).

- `components/pursuit/PursuitFieldEditor.tsx` — the rename subview (`SheetAwareTextInput` + Save).
- `components/pursuit/CompactFieldSheet.tsx` — the `@gorhom/bottom-sheet` `BottomSheetModal` wrapper (**the bug lives here**).
- `components/ui/SheetAwareTextInput.tsx` — correctly uses `BottomSheetTextInput` inside a sheet.

## Root cause

`CompactFieldSheet` uses `enableDynamicSizing` with `maxDynamicContentSize = 0.88 × windowHeight` **for every field**, and the rename field sets `keyboardBehavior="extend"` (grow the sheet until the input clears the keyboard). On shorter-than-Pro-Max screens the `0.88` cap **clamps that keyboard-driven growth**, so the input lands under a tall keyboard (predictive/dictation row adds height — visible in the report). The Pro Max's taller viewport keeps enough headroom that the cap never bites — hence the device split.

## Fix (pushed — `pathfinder-workspace` PR #1)

Give keyboard-anchored (rename) sheets near-full height to extend into; `extend` only grows as much as the keyboard needs, so taller screens stay compact and unchanged:

```diff
-  const maxDynamicContentSize = useMemo(
-    () => Math.round(windowHeight * 0.88),
-    [windowHeight],
-  );
+  const maxDynamicContentSize = useMemo(
+    () => Math.round(windowHeight * (keyboardAnchored ? 0.96 : 0.88)),
+    [keyboardAnchored, windowHeight],
+  );
```

The same sheet backs `CreateDraftFieldEditor`'s draft-title rename, so both rename entry points are covered.

## Verification still owed

Exercise on a **non-Pro-Max iPhone** (standard 15 / 15 Pro, or a mini): tap a chapter title → rename box sits **above** the keyboard, typing works, Save persists. Confirm the Pro Max still renders a compact sheet. No copy changes — `TERMINOLOGY.md` unaffected.
