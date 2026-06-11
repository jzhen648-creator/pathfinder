# Pathfinder terminology

**Backend and persistence vocabulary.** For **mobile UI copy**, [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) is the source of truth.

**Mental model (mobile):** Self → **theme** → **category** → **pursuit** (+ **status** on each pursuit; **marks** in theme detail). User-facing stack: **theme · category · pursuit · status · mark**. Legacy code: hub, track, `Branch`, `branchId` — retiring toward `Category`, `categoryId`.

**Mental model (desktop legacy):** Self → **theme** → **hub** → goals and timeline notes. See [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md). Desktop hub vocabulary is **legacy** — do not copy into mobile.

For historical UX wording inventory (desktop era), see [`docs/archive/UX-TERMINOLOGY-AUDIT.md`](./docs/archive/UX-TERMINOLOGY-AUDIT.md).

## Product hierarchy

| Term | Meaning |
|------|--------|
| **Self** | The user / center of the life map (conceptual). |
| **Theme** | One of six fixed pillars: **Money & Finance** `finance`, **Work & Career** `work`, **Self & Mind** `becoming`, **Play & Leisure** `pleasures`, **People & Relationships** `people`, **Health & Body** `health`. Locked hub names live in `src/lib/taxonomy.ts` (**20** system hubs total, taxonomy v8). **Catalog/config only** — not a database table. Older prose used **life area** for the same idea; in code the id is still **`LifeAreaId`**. |
| **Category** | User-facing name for a named slot under a theme (e.g. Job under Work & Career, Movement under Health & Body). Persisted as root **`Branch`** row + `branchId` on goals/marks (→ **`categoryId`** / **`Category`** in Prisma Phase 3–4). Shown in mobile theme detail groups and pursuit eyebrow. Legacy doc/code words: hub, track, section, taxonomy category. **Stream wire:** hub-scoped extract/commit use **`categoryId`** (Branch row id), mirrored as legacy **`hubId`**; theme-level item routing still uses **`hubId`** / **`categorySlug`** (normalized slug). |
| **Hub** | **Legacy** synonym for **category** — code, desktop UI, and old docs only. |
| **Track** | **Legacy** synonym for **category** — deprecated. Same row as **hub** / root **`Branch`**. |
| **Becoming (label)** | Human-readable name for theme id `becoming`. Use **"Self & Mind"** in UI. Legacy labels **Who I'm Becoming**, **Mind & Spirit**, and **Personal Growth** map to `becoming` in serializers only — do not use them in new copy. |
| **Branch** | A persisted **`Branch`** row: the database anchor for a **hub**; owns **timeline notes** (`Mark`) and goals via `branchId`. **Not** the same as **goal evolution** (`Goal.parentGoalId`). Columns `parentBranchId` / `turningPointId` remain for legacy rows; **new hub splits from the timeline are disabled** (2026-05). |
| **Goal evolution (legacy)** | Successor goal linked via `Goal.parentGoalId` / `forkedGoals`. Fork API removed; **Stream** adds new pursuits. Older docs: **continuation**. |
| **Goal** / **Pursuit** | Prisma **`Goal`**; user word **pursuit** only — **no subtypes** (not project, identity, or practice). **`goalType`** column is legacy wire; new creates default `"project"` until the column is dropped. Use **status** (especially **Maintaining**) for ongoing pursuits. Legacy `moment` / `event` rows are not map pursuits. |
| **Timeline note** (`Mark`) | Dated item on a **hub** (`Mark` via `branchId`) — **not** on a pursuit. Displayed in the hub panel and on the tree; created through Stream, not direct panel buttons. Product word: **timeline note**; Prisma model **`Mark`**. `Mark.kind` ∈ {`mark`, `stream`}. |
| **Unresolved mark** | `Mark.needsResolution` after Stream `ambiguous[]` auto-commit. Dashed **`?`** on tree; resolve on hover card or `POST /api/stream/resolve-ambiguous`. |
| **Archived** | `Goal.archived` / `Mark.archived` — hidden from tree; revivable from hub **Archive** section (`PATCH` `archived: false`). |
| **Sequence position** | `Goal.sequencePosition` / `Mark.sequencePosition`. Explicit branch-line order; both tables co-sort to form the unified `sequencedNodes` list on each hub. Continuation children (`parentGoalId`) opt out — they keep parent-anchored satellite layout. |
| **Edit map** | Tree toolbar mode: drag pursuits to another hub, nest under a pursuit, or reorder on the branch (`POST /api/goals/[goalId]/reorganize`). Off during Stream. |
| **Reorganize** | API op `moveToHub` \| `reparent` on `POST /api/goals/[goalId]/reorganize`. Same-theme constraint for hub moves. |
| **Insert-and-reflow** | Inserting a node on a branch shifts every later node outward; the branch line lengthens and never compresses. Active when `FLAGS.BRANCH_LONGITUDINAL_ALL` is on (env `NEXT_PUBLIC_BRANCH_LONGITUDINAL_ALL=1`). See `src/lib/branch-sequence.ts` (anchor resolver) and `tree-branch-geometry.ts` `branchNodeScreenPosition`. |
| **Path** | Visual connector only — not stored. |
| **Gap** | Computed placement hint — not stored. |

## Database: `limbId` (legacy column name)

Several Prisma models expose a field named **`limbId`**. That name is **legacy**; the value is always a **theme id** (same string union as **`LifeAreaId`** in TypeScript: `finance` | `work` | `becoming` | `pleasures` | `people` | `health`).

We keep the column name **`limbId`** for migrations and existing data. In new documentation and UI, describe it as the **theme** (or **theme id**), not “limb id.”

## Tree view (SVG)

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

## Status (user word; persisted as bloom until Prisma rename)

User-facing word: **Status** — Active · Maintaining · Paused · Complete.

Persisted **`Goal.bloomStatus`** values (→ column **`status`** in Prisma Phase 3): **`ACTIVE`**, **`PAUSED`**, **`COMPLETE`**, **`MAINTAINING`**, **`ABANDONED`**.

**JSON mirror (Phase 2):** GET/PATCH also expose **`status`** — same value as `bloomStatus`; mobile and new clients use **`status`** in code and **Status** in UI.

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
| **Category** (user) / `categoryId` (target) | hub, track, section, taxonomy category, `branchId`, `Branch` |
| **Pursuit** (user) / `Goal` (model) | project, identity, practice, `goalType` |
| **Status** (user) / `status` (target) | bloom, `bloomStatus`, on hold |
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
- **Capture progress** — pursuit-scoped apply (`PursuitInlineStream`, `/api/stream/pursuit/*`). Centre **+** opens add pursuit, not map-wide Stream.
- **Edit map** — toolbar toggle to drag-reorganize pursuits on the SVG map.
- **Continuation** — legacy prose for goal evolution; prefer **evolution** in new UI.
- **Goal** — user-facing word for roadmap items (some APIs still use `moments` internally).

Do **not** use **thread** in new user-facing copy for continuation; **thread** remains legacy internal wording for old geometry names (see Deprecated aliases).
