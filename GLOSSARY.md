# Pathfinder terminology

Canonical vocabulary for the product, tree view, roadmap, and database. Prefer these names in new code and user-facing copy.

## Product hierarchy

| Term | Meaning |
|------|--------|
| **Self** | The user / center of the life map (conceptual). |
| **Life area** | One of five fixed slices of life: **Money** (`finance`), **Work & Learning** (`work`), **Who I'm Becoming** (`becoming`), **Relationships** (`people`), **Health** (`health`). **Catalog/config only** — not a database table. |
| **Becoming (label)** | Human-readable name for life area id `becoming`. Use **"Who I'm Becoming"** in UI (matches the tree and pillars). Do not use **"Personal Growth"** or **"Growth"** as the pillar label. |
| **Branch** | A persisted **`Branch`** row: owns goals and marks; may have `parentBranchId` / `turningPointId` for forks. Typically one root branch per life area; more appear at turning points. |
| **Child branch** | A `Branch` with `parentBranchId` set (fork off a parent line). |
| **Goal** | Roadmap item (`Goal` model): types such as project, practice, identity; may include timeline-style `moment` / `event` goals. |
| **Mark** | Dated checkpoint on a branch (`Mark` model). |
| **Turning point** | Mark/goal that can split narrative into **child branches**. |
| **Path** | Visual connector only — not stored. |
| **Gap** | Computed placement hint — not stored. |

## Database: `limbId` (legacy column name)

Several Prisma models expose a field named **`limbId`**. That name is **legacy**; the value is always a **life area id** (one of `finance` | `work` | `becoming` | `people` | `health`), same as `LifeAreaId` in TypeScript.

We keep the column name **`limbId`** for migrations and existing data. In new documentation and UI, say **life area** (or **life area id**), not “limb id.”

## Tree view (SVG)

| Term | Meaning |
|------|--------|
| **`AreaData`** | One life area’s slice on the tree: label, color, and **`branches`** (lines). |
| **`AreaBranchData`** | One rendered **branch line**; **`id`** is the root **`Branch`** id. Holds timeline **`moments`**, **`goals`**, and optional **`siblings`** (child-branch metadata for splits). |
| **Life-area stem** | Trunk → hub geometry on the fork spec (fields may still say `limbPieces` / `limbTip` in JSON — the **stroke** from trunk into the hub, not the product word “limb”). |
| **`BranchForkSpec`** | Geometry of one branch line (fork point, tip, `branchPieces`). |
| **`BRANCH_SLOTS`** | Spine sampling templates per life area. |

## Roadmap view

| Term | Meaning |
|------|--------|
| **`ROADMAP_LIFE_AREA_*`** | Colors, column order, root node sizing, and related constants (formerly `ROADMAP_LIMB_*`). |
| **`visibleLifeAreaIds`** | Subset of life areas to lay out left-to-right; omitted = all. |
| **`roadmapLifeAreaRootId`**, **`ROADMAP_LIFE_AREA_ROOT_PREFIX`** | Synthetic root node id per visible life area. The prefix string may remain `limb-root:` for stable persisted node ids. |
| **`coerceRoadmapLifeAreaId`** | Normalizes a string to a known life area id. |

## Status (bloom)

**`BUD`**, **`GROWING`**, **`BLOOMED`**, **`BRANCHED`**, **`ENDED`** — used on goals and tree timeline nodes.

## Deprecated aliases (prefer the primary name)

| Prefer | Legacy |
|--------|--------|
| `LifeArea`, `LifeAreaId` | `Limb`, `LimbId` |
| `LIFE_AREA_SUBTYPES` | `LIMB_SUBTYPES` |
| `AreaBranchData`, `AreaData.branches` | `ThreadData`, `threads` |
| `BranchForkSpec`, `branchPieces` | `ThreadForkSpec`, `threadPieces` |
| Roadmap: `ROADMAP_LIFE_AREA_*`, `getRoadmapLifeAreaColor`, … | `ROADMAP_LIMB_*`, `getRoadmapLimbColor`, … |

## UI wording

- **Life area** — pillar / area names (Money & Finance, …, Who I'm Becoming, …).
- **Branch** — which persisted branch line a goal belongs to; branch tab on the tree.
- **Goal** — user-facing word for roadmap items (some APIs still use `moments` internally).
