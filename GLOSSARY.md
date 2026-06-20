# Pathfinder glossary (persistence & API)

**Mobile UI copy:** [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) is the source of truth.

**Mental model:** theme → category → pursuit (+ status). Prisma: `ThemeCategory`, `Goal`, `categoryId`, `themeId`.

Desktop tree vocabulary: [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md) and [`docs/archive/UX-TERMINOLOGY-AUDIT.md`](./docs/archive/UX-TERMINOLOGY-AUDIT.md) — do not copy into mobile.

---

## Column & model names

| Layer | Canonical | Legacy mirror / SQL |
|-------|-----------|---------------------|
| Category row | Prisma **`ThemeCategory`** | SQL table **`Branch`** until optional tail rename |
| FK on Goal | **`categoryId`** | JSON **`branchId`** |
| Theme on map entities | **`themeId`** | JSON **`limbId`** |
| Pursuit lifecycle | Prisma **`Goal.status`** | SQL column **`bloomStatus`** |
| Taxonomy stamp | Prisma **`User.taxonomyVersion`** | SQL column **`hubTaxonomyVersion`** |

Taxonomy Phases 1–3 shipped — see root [`TAXONOMY-CLEANUP.md`](../TAXONOMY-CLEANUP.md). Do **not** re-run migration work.

Map entities use **`themeId`** and **`categoryId`** in Postgres. JSON may still mirror **`limbId`** and **`branchId`** (`theme-id.ts`, `category-id.ts`) — intentional compat.

---

## Entities

| Term | Implementation |
|------|----------------|
| **Self** | The user / center of the life map (conceptual). |
| **Theme** | Six fixed ids: `finance`, `work`, `becoming`, `pleasures`, `people`, `health`. Locked category templates in `src/lib/taxonomy.ts` (**22** slots). **Catalog/config only** — not a DB table. Code type: **`LifeAreaId`**. UI label for `becoming`: **Self & Mind**. |
| **Category** | Prisma **`ThemeCategory`** root row; **`categoryId`** on `Goal`. Shown in mobile UI — theme detail groups, pursuit eyebrow, create/move pickers. Legacy words: hub, track, section, **`Branch`**. |
| **Goal / Pursuit** | Prisma **`Goal`**. User word **pursuit** — **no subtypes**. **`goalType`** column is legacy wire (default `"project"` until dropped). Use **status** (especially **Maintaining**) for ongoing pursuits. Legacy `moment` / `event` rows are timeline-only, not map pursuits. |
| **Milestone** | Prisma **`Milestone`** — phase within one goal only; never goal-to-goal evolution. |
| **Mark** | Prisma **`Mark`** — **schema-only on mobile** (no UI; `map-data` returns `marks: []`). Rows preserved for desktop / legacy data. |
| **Archived** | `Goal.archived` — hidden from map; restore via Settings → Archived pursuits (`PATCH` `archived: false`). |
| **Goal evolution (legacy data)** | `Goal.parentGoalId` / `forkedGoals`. Fork API removed — peers only on mobile. |
| **Sequence position** | `Goal.sequencePosition` — desktop branch-line order only. |
| **Reorganize** | `POST /api/goals/[goalId]/reorganize` — **desktop edit-map only**. |

---

## Status

User word: **Status** — Active · Maintaining · Paused · Complete.

Persisted: Prisma **`Goal.status`** (`@map("bloomStatus")` on SQL column). Values: **`ACTIVE`**, **`PAUSED`**, **`COMPLETE`**, **`MAINTAINING`**, **`ABANDONED`** (off map; Timeline only).

- **`ACTIVE`** — pursuit in progress.
- **`PAUSED`** — deliberately shelved.
- **`COMPLETE`** — achieved / finished.
- **`MAINTAINING`** — ongoing practice (legacy `practice` goalType → project + MAINTAINING).
- **`ABANDONED`** — off map.

Legacy **`ON_HOLD`**, **`BUD`**, **`GROWING`**, **`BLOOMED`**, **`ENDED`** normalized at read via `normalizeLegacyBloomStatus`. See `goal-status-lifecycle.ts`, `npm run backfill:goal-bloom`.

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
