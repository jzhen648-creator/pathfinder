# Mobile handoff — quiet signals, insight links, timeline seasons

**Audience:** the Cursor agent working in `pathfinder-mobile/`.
**Written:** 2026-07-13, after the backend shipped in `pathfinder` PRs #7 (quiet signals), #8 (status history), #10 (season events + map-data contract).
**Do the jobs in order, one PR each, device-QA on Expo Go between jobs.**

---

## Context (read once)

The API now measures **silence** (how long since a chapter was touched) and remembers **status history** (pauses and returns). The phone app must now *show* it. The product frame: the map is a mirror, not a supervisor. A quiet chapter is honest information in peripheral vision — never an alarm, never a nag.

## Design contract (non-negotiable, applies to all three jobs)

1. **Fade, don't alarm.** Quiet = lower saturation/opacity, like a fading photograph. **No red, no badges, no counts, no exclamation marks, no pulsing.**
2. **Silence never pushes.** Do not create any notification from these signals.
3. **Vocabulary:** user-facing word is **quiet** (or silent). Never "stale", "overdue", "behind", "neglected". User word for a goal is **chapter** (see `TERMINOLOGY.md`; add new copy words there).
4. **A pause is a chapter of the story, not a failure.** Neutral, warm copy. A return is stated plainly — no confetti, no congratulation.
5. **Trust the server.** Do not re-derive staleness client-side; use the flags/fields as sent. (Exception: seasons in Job 3 are derived client-side by design — rules below.)

## API contract (all from `GET /api/map-data`, all fields additive)

**Per goal** (each entry in `goals[]` now also carries):

| Field | Type | Meaning |
|---|---|---|
| `lastTouchedAt` | ISO datetime string | Most recent write to the chapter or a milestone completion |
| `daysSinceTouched` | int | Whole days since then, server-computed at fetch time |
| `stale` | boolean | true when ACTIVE untouched ≥ **60** days, or MAINTAINING ≥ **120**. Never true for PAUSED/COMPLETE |

**Top-level `themeActivity[]`** (themes with zero chapters are absent):

```ts
{ themeId: string; lastTouchedAt: string; daysSinceTouched: number;
  inProgressCount: number;  // ACTIVE + MAINTAINING chapters
  staleCount: number }      // of those, how many are quiet
```

**Top-level `statusTransitions[]`** (ascending by `at`; only *lived* changes — birth statuses, same-day flips, and corrections within 24h of creation are never rows):

```ts
{ goalId: string; fromStatus: "ACTIVE"|"PAUSED"|"COMPLETE"|"MAINTAINING";
  toStatus: string; at: string /* ISO datetime */ }
```

**Constants to mirror in mobile code** (source of truth: `pathfinder/src/lib/pursuit/status-transition-planner.ts` and `pursuit-staleness.ts`):

```ts
const ACTIVE_STALE_AFTER_DAYS = 60;
const MAINTAINING_STALE_AFTER_DAYS = 120;
const SEASON_MIN_DAYS = 7;          // a pause renders only if held this long
const COMEBACK_MIN_PAUSED_DAYS = 14; // a return is a comeback only after this much pause
```

---

## Job 1 — Quiet chapters on the map

**Goal:** stale chapters visibly fade on the hex canvas; a fully-quiet theme dims slightly.

**Rules:**
- Use the server's `stale` boolean per chapter. Two visual states only — normal and quiet. Do **not** build a gradual per-day fade (visual noise, implies false precision).
- Quiet render: reduce the hex's saturation and/or opacity subtly (target: noticeable when looking, invisible when not). Keep icon/label readable.
- Do not apply the quiet treatment to PAUSED or COMPLETE chapters (their `stale` is always false anyway — do not override).
- Theme dimming: only when `inProgressCount > 0 && staleCount === inProgressCount` in `themeActivity`. A theme with no in-progress chapters is left alone.
- No copy changes needed on the map itself. If a chapter sheet shows anything, the permitted phrasing is e.g. "Quiet for 74 days" (from `daysSinceTouched`).

**Acceptance:**
- A backdated chapter (SQL below) renders faded; touching it (any edit) restores it on next map fetch.
- A theme whose only in-progress chapter is quiet dims; adding a fresh chapter undims it.
- Nothing red, no badges anywhere; typecheck clean (`npx tsc --noEmit`).

## Job 2 — Insights link to the map

**Goal:** every insight is a door. Reading an insight always gives you somewhere to go.

**Rules:**
- Insight payloads are keyed by pursuit id and theme id already. Make each chapter-insight card tappable → open that chapter's existing map sheet; each theme insight → open that theme (same surface the map uses — modal routes were retired, do not re-add them).
- If the target chapter was archived since the insight was cached, fail soft: no-op or a quiet toast, never a crash.

**Acceptance:** tap any insight → land on the right chapter/theme sheet; archived target does not crash.

## Job 3 — Seasons on the Timeline

**Goal:** the Timeline shows pauses and returns as story entries.

**Rules (mirror of the backend's `season-events.ts` — keep identical semantics):**
- Group `statusTransitions` by `goalId`, sort ascending by `at`.
- **Paused entry:** a transition with `toStatus === "PAUSED"` where the pause was *held* ≥ `SEASON_MIN_DAYS` — measure to the goal's next transition, or to today if none (open-ended pauses count once they've been held long enough).
- **Returned entry:** a transition `fromStatus === "PAUSED"` → ACTIVE/MAINTAINING, whose immediately-preceding transition was the pause, with pause duration ≥ `COMEBACK_MIN_PAUSED_DAYS`. Show real duration: **"Returned after 94 days."**
- Skip transitions whose `goalId` is not in the current `goals[]` payload (archived chapters).
- Copy: "Paused" / "Returned after N days" — neutral. No streak language, no celebration animation.
- Expect the list to be empty at first: history recording started 2026-07-13. Build it anyway; it fills as life happens. No special empty-state needed.

**Acceptance:** seeded transitions (SQL below) render as paused/returned entries in the right chronological place; sub-threshold pauses/returns render nothing.

---

## QA: faking history in the dev database

Staleness and seasons can't be tested with fresh data. Run these against the **dev** database (raw SQL bypasses Prisma's auto-`updatedAt`, which is exactly why it works):

```sql
-- Make a chapter quiet (choose a real ACTIVE goal id):
UPDATE "Goal" SET "updatedAt" = now() - interval '90 days' WHERE id = '<goalId>';

-- Seed a lived pause + comeback for the Timeline:
INSERT INTO "PursuitStatusTransition" (id, "userId", "goalId", "fromStatus", "toStatus", at)
VALUES
  ('qa-pause-1', '<userId>', '<goalId>', 'ACTIVE', 'PAUSED', now() - interval '100 days'),
  ('qa-return-1', '<userId>', '<goalId>', 'PAUSED', 'ACTIVE', now() - interval '6 days');

-- Clean up after QA:
DELETE FROM "PursuitStatusTransition" WHERE id LIKE 'qa-%';
```

Then pull-to-refresh / reopen the map in Expo Go. (Note: any Prisma-mediated edit to the goal resets `updatedAt` to now — re-run the backdate if needed.)

## Out of scope — do not build

- Notifications or a weekly summary (later, deliberately).
- Map time-scrubber / replay (separate milestone).
- Any per-day gradient fading, scores, rankings, or "attention needed" framing.
- New tabs or routes — integrate into existing surfaces only.

## Definition of done, per job

`npx tsc --noEmit` clean in `pathfinder-mobile` · verified on a device via Expo Go (screenshots in the PR) · copy words checked against `TERMINOLOGY.md` · committed and pushed.
