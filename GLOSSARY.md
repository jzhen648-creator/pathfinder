# Almanac glossary (persistence & API)

> **Legacy compatibility vocabulary.** The current user-facing unit is Subject;
> `AlmanacPlace`, `placeId`, `atlas` and `slot` remain storage/wire names only.
> Use [`../docs/current/ALMANAC-PRODUCT-CANON.md`](../docs/current/ALMANAC-PRODUCT-CANON.md).

**Mobile UI copy:** [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) is the source of truth.

**Mental model:** theme → category → pursuit (+ status). Prisma: `ThemeCategory`, `Goal`, `categoryId`, `themeId`.

**Naming layers:** **chapter** = mobile UI copy (see `pathfinder-mobile/TERMINOLOGY.md`) · **pursuit** = code/API/doc vocabulary · **`Goal`** = Prisma model. All three name the same entity.

Desktop tree vocabulary: [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md) — do not copy into mobile.

---

## Column & model names

| Layer | Canonical | Legacy mirror / SQL |
|-------|-----------|---------------------|
| Category row | Prisma **`ThemeCategory`** | SQL table renamed from `Branch` (2026-06-12, `20260612180000_physical_taxonomy_rename_tail`) |
| FK on Goal | **`categoryId`** | JSON **`branchId`** |
| Theme on map entities | **`themeId`** | JSON **`limbId`** |
| Pursuit lifecycle | Prisma **`Goal.status`** | SQL column renamed from `bloomStatus` (2026-06-12); JSON **`bloomStatus`** deprecated on create |
| Insight cache (category tier) | **`categoryInsights`** / API **`categories`** | SQL column **`hubInsights`** via `@map` (still mapped); JSON **`hubs`** (dual-read, retiring) |
| Unlocked themes | **`unlockedThemeIds`** on map-data | JSON column **`unlockedLimbIds`** on User (SQL name unchanged) |
| Taxonomy stamp | Prisma **`User.taxonomyVersion`** | SQL column renamed from `hubTaxonomyVersion` (2026-06-12); `isSystemHub` → `isSystemCategory` same migration |
| Background prose | Prisma **`Goal.background`** | SQL column **`rationale`** via `@map` (rename deferred post-TestFlight) |

Taxonomy Phases 1–3 shipped — see `TAXONOMY-CLEANUP.md` (workspace root, **not in this repo**). Do **not** re-run migration work.

Map entities use **`themeId`** and **`categoryId`** in Postgres. JSON may still mirror **`limbId`** and **`branchId`** (`theme-id.ts`, `category-id.ts`) — intentional compat.

---

## Entities

| Term | Implementation |
|------|----------------|
| **Self** | The user / center of the life map (conceptual). |
| **Theme** | Six fixed ids: `finance`, `work`, `becoming`, `pleasures`, `people`, `health`. Locked category templates in `src/lib/taxonomy.ts` (**23** slots). **Catalog/config only** — not a DB table. Code type: **`LifeAreaId`**. UI label for `becoming`: **Self & Mind**. |
| **Category** | Prisma **`ThemeCategory`** root row; **`categoryId`** on `Goal`. Shown in mobile UI — theme detail groups, pursuit eyebrow, create/move pickers. Legacy words: hub, track, section, **`Branch`**. |
| **Goal / Pursuit** | Prisma **`Goal`**. Mobile UI word **chapter** (`pathfinder-mobile/TERMINOLOGY.md`); code/doc word **pursuit** — **no subtypes**. **`goalType`** column is legacy wire (schema default `"action"`; ignore until dropped). Use **status** (especially **Maintaining**) for ongoing pursuits. Legacy `moment` / `event` rows are timeline-only, not map pursuits. |
| **Milestone** | Prisma **`Milestone`** — phase within one goal only; never goal-to-goal evolution. |
| **Mark** | **Retired** — `Mark` table dropped (`20260621120000_drop_legacy_desktop_schema`); mobile never showed marks |
| **Archived** | `Goal.archived` — hidden from map; restore via Settings → Archived pursuits (`PATCH` `archived: false`). |
| **Goal evolution (legacy data)** | `Goal.parentGoalId` / `forkedGoals`. Fork API removed — peers only on mobile. |
| **Sequence position** | `Goal.sequencePosition` — explicit linear order along the parent category line (mobile reorganize fallback). |
| **Reorganize** | `POST /api/goals/[goalId]/reorganize` — serves **mobile edit-map** move/reparent (desktop edit-map retired). |
| **Status transition** | Prisma **`PursuitStatusTransition`** — lived status history only (seasons/comebacks). Birth statuses, authoring-window corrections, and short-window flips never write rows — rules in `src/lib/pursuit/status-transition-planner.ts`. |

---

## Status

User word: **Status** — Active · Maintaining · Paused · Complete.

Persisted: Prisma **`Goal.status`** (SQL column `status` since 2026-06-12). Values: **`ACTIVE`**, **`PAUSED`**, **`COMPLETE`**, **`MAINTAINING`**.

- **`ACTIVE`** — pursuit in progress.
- **`PAUSED`** — deliberately shelved.
- **`COMPLETE`** — achieved / finished.
- **`MAINTAINING`** — ongoing practice (legacy `practice` goalType → project + MAINTAINING).

**`ABANDONED` removed** (2026-06-19, `20260619120000_remove_abandoned_status`) — archive is the sole removal path; remaining abandoned rows were converted to `archived: true`.

Legacy **`ON_HOLD`**, **`BUD`**, **`GROWING`**, **`BLOOMED`**, **`ENDED`** normalized at read via `normalizeLegacyPursuitStatus`. See `goal-status-lifecycle.ts`, `npm run backfill:goal-status`.

---

## Deprecated aliases

| Prefer | Legacy |
|--------|--------|
| **Theme** / `LifeAreaId` / `themeId` | life area, `Limb`, `limbId` |
| **Category** / `categoryId` | hub, track, section, `branchId`, `Branch` |
| **Pursuit** / `Goal` | project, identity, practice, `goalType` |
| **Status** / `status` | bloom, `bloomStatus`, on hold |
| `LIFE_AREA_SUBTYPES` | `LIMB_SUBTYPES` |
| `DomainHubData`, `AreaData.branches` | `ThreadData`, `threads` (never means goal continuation) |

Do **not** use **thread** in new user-facing copy. Do **not** use **hub / track / section** in mobile UI — use **category**.

---

## Desktop-only (on hold)

Tree view types (`AreaData`, `DomainHubData`, `BranchForkSpec`), roadmap constants (`ROADMAP_LIFE_AREA_*`), edit-map reorganize, mark hover cards, branch-line sequence — see [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md). Mobile agents can skip.

Entity relationships and surface roles: [`ONTOLOGY.md`](./ONTOLOGY.md).
