# Pathfinder terminology

Canonical vocabulary for the product, tree view, roadmap, and database. Prefer these names in new **user-facing copy** and product documentation.

**Mental model:** Self → **theme** → **hub** → **goals** (and **timeline notes** on the hub where applicable). TypeScript and Prisma still use historical identifiers (`LifeAreaId`, `limbId`, `branchId`); see each term below.

For ongoing UX wording inventory and Phase 2 notes, see [`docs/UX-TERMINOLOGY-AUDIT.md`](./docs/UX-TERMINOLOGY-AUDIT.md).

## Product hierarchy

| Term | Meaning |
|------|--------|
| **Self** | The user / center of the life map (conceptual). |
| **Theme** | One of the fixed pillars of the map (e.g. **Money & Finance** `finance`, **Work & Learning** `work`, **Who I'm Becoming** `becoming`, **People & Relationships** `people`, **Health & Body** `health`, plus catalog ids such as **Pleasures** where enabled). **Catalog/config only** — not a database table. Older prose used **life area** for the same idea; in code the id is still **`LifeAreaId`**. |
| **Hub** | A **named track under a theme** (e.g. Family, Skills, Romance) — **where goals and timeline notes attach** in product language. Each hub corresponds to one root **`Branch`** row (four starter hubs per theme by default). Prefer **hub** over **branch line** in new UI strings. |
| **Becoming (label)** | Human-readable name for theme id `becoming`. Use **"Who I'm Becoming"** in UI (matches the tree and pillars). Do not use **"Personal Growth"** or **"Growth"** as the pillar label. |
| **Branch** | A persisted **`Branch`** row: the database anchor for a **hub**; owns **timeline notes** (`Mark`) and goals via `branchId`. **Not** the same as **goal evolution** (`Goal.parentGoalId`). Columns `parentBranchId` / `turningPointId` remain for legacy rows; **new hub splits from the timeline are disabled** (2026-05). |
| **Goal evolution** | Successor goal linked from a prior goal: `Goal.parentGoalId`, fork API, `forkedGoals`. Same idea older docs called **continuation** — a longitudinal **next chapter**, not nested milestones. |
| **Goal** | Roadmap item (`Goal` model): types such as project, practice, identity; may include timeline-style `moment` / `event` goals. Carries **bloom** lifecycle for that pursuit alone. |
| **Timeline note** (`Mark`) | Dated item on a hub’s timeline (`Mark` model via `branchId`). Product language: **timeline note**; the Prisma model name stays **`Mark`**. Distinct from **milestones** on a goal. |
| **Path** | Visual connector only — not stored. |
| **Gap** | Computed placement hint — not stored. |

## Database: `limbId` (legacy column name)

Several Prisma models expose a field named **`limbId`**. That name is **legacy**; the value is always a **theme id** (same string union as **`LifeAreaId`** in TypeScript: `finance` | `work` | `becoming` | `people` | `health`, plus other catalog ids such as `pleasures` where present).

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

## Roadmap view

| Term | Meaning |
|------|--------|
| **`ROADMAP_LIFE_AREA_*`** | Colors, column order, root node sizing, and related constants (formerly `ROADMAP_LIMB_*`). Names retain `LIFE_AREA` for code stability; in product copy these columns are **themes**. |
| **`visibleLifeAreaIds`** | Subset of **themes** to lay out left-to-right; omitted = all. |
| **`roadmapLifeAreaRootId`**, **`ROADMAP_LIFE_AREA_ROOT_PREFIX`** | Synthetic root node id per visible **theme**. The prefix string may remain `limb-root:` for stable persisted node ids. |
| **`coerceRoadmapLifeAreaId`** | Normalizes a string to a known **theme** id. |

## Status (bloom)

For **`Goal`** lifecycle, canonical states are **`BUD`**, **`GROWING`**, **`BLOOMED`**, **`ENDED`**.

- **`BUD`** — no milestones yet (with exceptions for `moment` / `event` without milestones).
- **`GROWING`** — milestones exist; goal not yet achieved.
- **`BLOOMED`** — goal achieved. Remains **`BLOOMED`** even when the goal has **continuation** successors.
- **`ENDED`** — abandoned / stopped via the end flow.

**`BRANCHED`** — **deprecated on goals**: previously tied to “has continuation goals”; do not use for goal lifecycle going forward. Enum value remains for SQLite/Prisma compatibility until a future migration. Timeline **`MomentNode`** logic may still produce **`BRANCHED`** for turning-point visuals — separate from goal bloom semantics.

See [`ONTOLOGY.md`](./ONTOLOGY.md) and `npm run backfill:goal-bloom` for normalizing legacy rows.

## Deprecated aliases (prefer the primary name)

| Prefer | Legacy |
|--------|--------|
| **Theme** (user-facing) / `LifeArea`, `LifeAreaId` (code) | Older prose: **life area**; oldest code: `Limb`, `LimbId` |
| `LIFE_AREA_SUBTYPES` | `LIMB_SUBTYPES` |
| **Hub** (user-facing) | Older UI: **branch line** for the same track |
| **Timeline note** (user-facing) | Older copy: **mark** (Prisma model remains `Mark`) |
| `DomainHubData`, `AreaData.branches` | `ThreadData`, `threads` (**deprecated** — never means goal continuation) |
| `AreaBranchData` | Same as `DomainHubData` (**deprecated** name only) |
| `BranchForkSpec`, `branchPieces` | `ThreadForkSpec`, `threadPieces` |
| Roadmap: `ROADMAP_LIFE_AREA_*`, `getRoadmapLifeAreaColor`, … | `ROADMAP_LIMB_*`, `getRoadmapLimbColor`, … |

## UI wording

- **Theme** — pillar labels (Money & Finance, Work & Learning, Who I'm Becoming, …).
- **Hub** — which track a goal or timeline note sits on (maps to a root **`Branch`** row).
- **Goal evolution** / **Evolve goal** — user-facing verbs for the `parentGoalId` / fork flow (older docs: **continuation**).
- **Continuation** — legacy prose for goal evolution; prefer **evolution** in new UI.
- **Goal** — user-facing word for roadmap items (some APIs still use `moments` internally).

Do **not** use **thread** in new user-facing copy for continuation; **thread** remains legacy internal wording for old geometry names (see Deprecated aliases).
