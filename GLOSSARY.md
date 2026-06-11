# Pathfinder terminology

**Backend and persistence vocabulary.** For **mobile UI copy**, [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) is the source of truth.

**Mental model (mobile):** Self → **theme** → **category** → **pursuit** (+ **status** on each pursuit; **marks** in theme detail). User-facing stack: **theme · category · pursuit · status · mark**. Prisma: `ThemeCategory`, `categoryId`, `themeId`. JSON API still mirrors `branchId`, `limbId`, `branches[]` for compat — see **Persistence names** below.

**Mental model (desktop legacy):** Self → **theme** → **hub** → goals and timeline notes. See [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md). Desktop hub vocabulary is **legacy** — do not copy into mobile.

For historical UX wording inventory (desktop era), see [`docs/archive/UX-TERMINOLOGY-AUDIT.md`](./docs/archive/UX-TERMINOLOGY-AUDIT.md).

## Persistence names (2026-06-11)

| Layer | Canonical | Legacy mirror / SQL |
|-------|-----------|---------------------|
| Category row | Prisma **`ThemeCategory`** | SQL table still **`Branch`** until optional tail rename |
| FK on Goal/Mark | **`categoryId`** | JSON **`branchId`** |
| Theme on map entities | **`themeId`** | JSON **`limbId`** |
| Pursuit lifecycle | Prisma **`Goal.status`** | SQL column **`bloomStatus`**; JSON may expose both |
| Taxonomy stamp | Prisma **`User.taxonomyVersion`** | SQL column **`hubTaxonomyVersion`** |

Do **not** re-run taxonomy Phases 1–3 — shipped. See root [`TAXONOMY-CLEANUP.md`](../TAXONOMY-CLEANUP.md) *Shipped state*.

## Product hierarchy

| Term | Meaning |
|------|--------|
| **Self** | The user / center of the life map (conceptual). |
| **Theme** | One of six fixed pillars: **Money & Finance** `finance`, **Work & Career** `work`, **Self & Mind** `becoming`, **Play & Leisure** `pleasures`, **People & Relationships** `people`, **Health & Body** `health`. Locked category templates in `src/lib/taxonomy.ts` (**22** system categories). **Catalog/config only** — not a database table. Code id: **`LifeAreaId`** / DB **`themeId`**. |
| **Category** | User-facing name for a named slot under a theme (e.g. Job, Movement). Persisted as root **`ThemeCategory`** row + **`categoryId`** on goals/marks. **Shown in mobile UI** — theme detail groups, pursuit eyebrow, create/move pickers. JSON API mirrors **`branchId`**. Legacy words: hub, track, section. AI routing: **`categoryId`** (row id) and **`categorySlug`**; Stream JSON may still say **`hubId`**. |
| **Hub** | **Legacy** synonym for **category** — code, desktop UI, and old docs only. |
| **Track** | **Legacy** synonym for **category** — deprecated. Same row as **hub** / **`ThemeCategory`**. |
| **Becoming (label)** | Human-readable name for theme id `becoming`. Use **"Self & Mind"** in UI. Legacy labels **Who I'm Becoming**, **Mind & Spirit**, and **Personal Growth** map to `becoming` in serializers only — do not use them in new copy. |
| **ThemeCategory** | Prisma model for a category slot (`@@map("Branch")` on SQL table until optional tail rename). Owns goals and marks via **`categoryId`**. **`parentCategoryId`** / `turningPointId` remain for legacy split rows; **new splits from the timeline are disabled** (2026-05). |
| **Branch** | **Legacy** name for **`ThemeCategory`** / SQL **`Branch`** table — desktop tree and old docs only. |
| **Goal evolution (legacy)** | Successor goal linked via `Goal.parentGoalId` / `forkedGoals`. Fork API removed; **Stream** adds new pursuits. Older docs: **continuation**. |
| **Goal** / **Pursuit** | Prisma **`Goal`**; user word **pursuit** only — **no subtypes** (not project, identity, or practice). **`goalType`** column is legacy wire; new creates default `"project"` until the column is dropped. Use **status** (especially **Maintaining**) for ongoing pursuits. Legacy `moment` / `event` rows are not map pursuits. |
| **Timeline note** (`Mark`) | Life fact or event on a **category** (`Mark.categoryId`) — **not** on a pursuit. Listed in mobile **theme detail**; desktop hub/tree panels for legacy UI. Product word: **mark**; Prisma **`Mark`**. `Mark.kind` ∈ {`mark`, `stream`}. |
| **Unresolved mark** | `Mark.needsResolution` after Stream `ambiguous[]` auto-commit. Dashed **`?`** on tree; resolve on hover card or `POST /api/stream/resolve-ambiguous`. |
| **Archived** | `Goal.archived` / `Mark.archived` — hidden from tree; revivable from hub **Archive** section (`PATCH` `archived: false`). |
| **Sequence position** | `Goal.sequencePosition` / `Mark.sequencePosition`. Explicit branch-line order; both tables co-sort to form the unified `sequencedNodes` list on each hub. Continuation children (`parentGoalId`) opt out — they keep parent-anchored satellite layout. |
| **Edit map** | **Desktop only** — tree toolbar mode: drag pursuits to another category, nest under a pursuit, or reorder (`POST /api/goals/[goalId]/reorganize`). Not on mobile. |
| **Reorganize** | API op `moveToHub` \| `reparent` on `POST /api/goals/[goalId]/reorganize`. Same-theme constraint for category moves. |
| **Insert-and-reflow** | **Desktop only** — branch-line insert shifts later nodes outward when `FLAGS.BRANCH_LONGITUDINAL_ALL` is on. |
| **Path** | Visual connector only — not stored. |
| **Gap** | Computed placement hint — not stored. |

## Database: `themeId` and JSON mirrors

Map entities use **`themeId`** and **`categoryId`** in Postgres. JSON responses may still mirror **`limbId`** and **`branchId`** (`theme-id.ts`, `category-id.ts`) — intentional compat, not drift.

In new documentation and UI, describe **`themeId`** as the **theme id** (same union as **`LifeAreaId`**).

## Tree view (SVG) — desktop on hold

*Legacy desktop tree vocabulary below. Mobile agents can skip.*

| Term | Meaning |
|------|--------|
| **`AreaData`** | One **theme’s** slice on the tree: label, color, and **`branches`** (runtime: **hubs** — one root **`Branch`** per hub). |
| **`DomainHubData`** | One **hub** for the tree: **`id`** is the root **`Branch`** id. Holds timeline **`moments`** and orbital **`goals`**. Fork/conduit geometry is derived in `tree-forks` / `tree-branch-geometry`, not stored on this row. |
| **`AreaBranchData`** | **Deprecated** type alias for **`DomainHubData`** (legacy name implied path-authored geometry). |
| **Theme stem** | Hub gateway geometry on the fork spec (`limbPieces` / `limbTip`): the **stroke** from a synthetic point toward the gateway (trunk is backdrop-only, not data). |
| **`BranchForkSpec`** | Geometry of one hub’s conduit/fork (gateway, hub center, `branchPieces`). |
| **`AREA_ANCHORS`** (`tree-area-anchors.ts`) | Authored **gateway** and four **polar hub** rays per **theme** — fork geometry is derived from this (paths are decoration). Stem root toward the trunk is computed in `buildAreaForkFromAnchors`. |
| **Mark hover card** | `MarkHoverCard` — primary timeline-note detail UI on the tree (hover + pin). Replaces the old bottom-sheet moment panel. |
| **Detail rail** | Left overlay column for theme / hub / pursuit panels (`panelPresentation="rail"`). |
| **Canvas mark** | Amber **diamond** beside the branch ray (`TreeMarkNode`, `branchMarkScreenPosition`) — shares sequence rank with pursuits but offset laterally. |

## Roadmap view

| Term | Meaning |
|------|--------|
| **`ROADMAP_LIFE_AREA_*`** | Colors, column order, root node sizing, and related constants (formerly `ROADMAP_LIMB_*`). Names retain `LIFE_AREA` for code stability; in product copy these columns are **themes**. |
| **`visibleLifeAreaIds`** | Subset of **themes** to lay out left-to-right; omitted = all. |
| **`roadmapLifeAreaRootId`**, **`ROADMAP_LIFE_AREA_ROOT_PREFIX`** | Synthetic root node id per visible **theme**. The prefix string may remain `limb-root:` for stable persisted node ids. |
| **`coerceRoadmapLifeAreaId`** | Normalizes a string to a known **theme** id. |

## Status (user word)

User-facing word: **Status** — Active · Maintaining · Paused · Complete.

Persisted: Prisma **`Goal.status`** (`@map("bloomStatus")` on SQL column). Values: **`ACTIVE`**, **`PAUSED`**, **`COMPLETE`**, **`MAINTAINING`**, **`ABANDONED`**. JSON may expose **`status`** and **`bloomStatus`** mirrors.

- **`ACTIVE`** — pursuit in progress (milestones may or may not exist).
- **`PAUSED`** — deliberately shelved; user or Stream set; not auto-recomputed. Mobile UI: **Paused** (legacy copy: on hold).
- **`COMPLETE`** — achieved / finished.
- **`MAINTAINING`** — ongoing practice (legacy `practice` goalType → project + MAINTAINING).
- **`ABANDONED`** — off map; visible on Timeline only.

Legacy **`ON_HOLD`**, **`BUD`**, **`GROWING`**, **`BLOOMED`**, **`ENDED`** are normalized at read via `normalizeLegacyBloomStatus`.

See [`ONTOLOGY.md`](./ONTOLOGY.md), `npm run backfill:goal-bloom`, and `npm run backfill:flatten-goal-lineage`.

## Deprecated aliases (prefer the primary name)

| Prefer | Legacy |
|--------|--------|
| **Theme** (user) / `LifeAreaId` (code) | life area, `Limb`, `limbId` |
| **Category** (user) / **`categoryId`** (code) | hub, track, section, `branchId`, `Branch`, `ThemeCategory` (when meaning SQL table name in UI) |
| **Pursuit** (user) / `Goal` (model) | project, identity, practice, `goalType` |
| **Status** (user) / **`status`** (code) | bloom, `bloomStatus`, on hold |
| **Timeline note** (user) / **Mark** (model) | mark (older copy) |
| `LIFE_AREA_SUBTYPES` | `LIMB_SUBTYPES` |
| `DomainHubData`, `AreaData.branches` | `ThreadData`, `threads` (**deprecated** — never means goal continuation) |
| `AreaBranchData` | Same as `DomainHubData` (**deprecated** name only) |
| `BranchForkSpec`, `branchPieces` | `ThreadForkSpec`, `threadPieces` |
| Roadmap: `ROADMAP_LIFE_AREA_*`, `getRoadmapLifeAreaColor`, … | `ROADMAP_LIMB_*`, `getRoadmapLimbColor`, … |

## UI wording

- **Theme** — pillar labels (Money & Finance, Work & Career, Self & Mind, Play & Leisure, …).
- **Category** — slot label under a theme (Job, Movement, …); mobile theme detail + pursuit eyebrow (`Work & Career · Job`).
- **Pursuit** — map node / goal the user is building.
- **Status** — Active, Maintaining, Paused, Complete (never bloom / on hold in UI).
- **Hub / track / section** — legacy; use **category**.
- **Capture progress** — pursuit-scoped pending note (`PursuitCaptureSheet`, `/api/stream/pursuit/*`, `/api/goals/[goalId]/capture`). Digested on **Update readings** (`POST /api/map/ai-sync`). Centre **+** opens add pursuit, not map-wide extract UI.
- **Edit map** — toolbar toggle to drag-reorganize pursuits on the SVG map.
- **Continuation** — legacy prose for goal evolution; prefer **evolution** in new UI.
- **Goal** — user-facing word for roadmap items (some APIs still use `moments` internally).

Do **not** use **thread** in new user-facing copy for continuation; **thread** remains legacy internal wording for old geometry names (see Deprecated aliases).
