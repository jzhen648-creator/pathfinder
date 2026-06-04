# Architecture (compressed)

Pathfinder is a **tree-first personal life map**: messy human input → durable structure on an SVG canvas. The architecture optimizes for **symbolic coherence** (milestones, bloom, spatial grammar) over CRUD completeness, and accepts **parallel layout grammars** behind flags rather than big-bang rewrites.

## Core philosophy

1. **The map is truth** — Pursuits and timeline notes land on the tree, not in chat history. Stream confirms structured items; ambiguous items appear on the map immediately (`needsResolution`) and resolve in place.
2. **Separate persistence from presentation** — Prisma rows are canonical; tree geometry, hex orbitals, staging, and materials are **derived** at read/render time (`mapToTreeData`, `milestone-tree-projection`, `tree-branch-geometry`).
3. **Hub-scoped timeline, pursuit-scoped milestones** — `Mark` never nests under `Goal`; `Milestone` never models goal-to-goal evolution (`parentGoalId` is legacy layout only).
4. **Incremental visual evolution** — Large layout shifts (trunk grammar, longitudinal branches) ship behind `FLAGS` and env vars; old paths stay callable for rollback and A/B eyeballing.
5. **Stabilization over novelty** — Post–May 2026 sprint: relational milestones only, fork/Evolve removed, panels simplified. Broad renderer refactors are discouraged without explicit product intent (`docs/STABILIZATION.md`).

## System mental model

```
Self (conceptual)
 └─ Theme (fixed catalog: finance | work | becoming | people | health)
     └─ Hub (root Branch row; progressive isActive reveal)
         ├─ Pursuit (Goal) — hex on branch; relational Milestones → orbital projection
         ├─ Timeline note (Mark) — amber diamond beside ray; hub-only
         └─ sequencedNodes — co-sorted Goal + Mark by sequencePosition (when used)
```

**Stream** sits orthogonal to the hierarchy: extract → confirm (except ambiguous) → commit via branch-sequence anchors and taxonomy routing (`hub-catalog` `aiRoutingNote`).

**Data flow:** `GET /api/branches` (may mutate taxonomy via `syncHubTaxonomyForUser`) → client `mapToTreeData` → `TreeView` orchestrates pan/zoom, panels, Stream, edit-map → `TreeSVG` + geometry modules paint.

## Rendering / layout philosophy

**Authored anchors, derived forks** — Theme gateways and hub fans live in constants (`tree-area-anchors`, `tree-trunk-slots`, `AREA_ANCHORS`). Stored DB coordinates are **not** the primary layout source for the live tree (edit-map moves goals/hubs via APIs, not free SVG drag of taxonomy).

**Grammar bundles, not one layout** — `tree-renderer-grammar.ts` discriminates:
- **Trunk layout** (`TREE_TRUNK_LAYOUT`) — vertical trunk, alternating theme attach; default on.
- **Domain-cluster** — root goals on 360° polar orbit around hub; default for all five themes when longitudinal flag off.
- **Longitudinal** (`BRANCH_LONGITUDINAL_ALL`) — rank along outward ray; branch tip grows with node count; insert-and-reflow contract.

These coexist intentionally. Flipping flags must not require schema changes.

**Visual hierarchy without killing limbs** — Macro composition (`tree-render-staging.ts`) uses draw order, per-limb transform/drift, materials, and milestone-driven goal phases—not whole-limb opacity cliffs (learned May 2026: global alpha made quadrants feel “disabled”).

**Milestone-driven ornament** — Hex orbitals, coherence chords, ambient GROWING halo are **projection + CSS**; they do not write back to geometry. Symbolic completion authority: `milestoneDoneForSemantics` → bloom recompute.

**Interaction minimalism** — Navigation hits are **nodes + gateway row**, not limb hull polygons or wide invisible stems (May 2026). Map empty-click dismisses panels; edit-map disables pan.

## Abstraction strategy

| Layer | Role |
|-------|------|
| `src/lib/*` | Pure rules: bloom lifecycle, branch sequence, stream commit, taxonomy sync, AI extract |
| `src/components/tree/*` | SVG world: geometry, staging, data assembly, view orchestration |
| `src/app/api/*` | Thin routes; validation in `src/lib/validation/*` |
| Catalogs | `taxonomy.ts`, `hub-catalog.ts`, `theme-catalog.ts` — locked templates + AI routing copy |

Prefer **small pure modules** over framework indirection. Tree code is intentionally verbose and constant-heavy—tunability beats DRY for layout.

**Flags as release valves** — `src/lib/flags.ts` inlines `NEXT_PUBLIC_*` at compile time; restart dev server after env changes.

## Composability patterns

- **Assembly then render** — `mapToTreeData` builds `AreaData` / `DomainHubData` / `sequencedNodes`; SVG consumes stable types (`tree-types.ts`).
- **Projection adapters** — Milestones DB → `TreeOrbitalMilestone`; bloom DB → `normalizeGoalBloomForDisplay` + `deriveGoalNodeRenderState`.
- **Anchor resolver** — `branch-sequence.ts` centralizes insert/reflow; APIs and Stream share it.
- **Panel rail vs map chrome** — Theme/hub/pursuit in left rail; marks via `MarkHoverCard` on canvas.
- **Stream confirmation queue** — Per-item commit; ambiguous bypasses queue by design.

## Important constraints

- **Five themes, 17 system hubs** (`LOCKED_HUB_TEMPLATES`, `TAXONOMY_VERSION`) — hub taxonomy sync runs on register, onboarding complete, hub activate, and `npm run backfill:hub-taxonomy`; keyed by `User.hubTaxonomyVersion` vs `TAXONOMY_VERSION`.
- **No new hub splits from timeline** — `parentBranchId` / turning points are legacy only.
- **Marks never on pursuits** — Stream prompts enforce; UI has no pursuit “add mark”.
- **Continuation children opt out of sequence** — `parentGoalId` goals use satellite layout (`continuationChildScreenPosition`).
- **Auth** — Middleware session gate on pages and `/api/*` except auth routes.
- **SQLite + Prisma** — Single-tenant dev shape; backfill scripts are part of the architecture, not optional niceties.

## Architectural tensions (honest)

| Tension | State |
|---------|--------|
| Domain-cluster vs longitudinal layout | APIs + `sequencedNodes` live; visual default still domain-cluster (`BRANCH_LONGITUDINAL_ALL: false`) |
| Docs say BUD/GROWING/BLOOMED | DB enum is `ACTIVE` / `ON_HOLD` / `COMPLETE`; visuals use milestone-derived `visualPhase` |
| `thread*` in code vs “hub” in product | Geometry/seeds still use thread aliases; forbidden for new domain IDs |
| `GET /api/branches` mutates taxonomy | **Resolved (May 2026):** GET is read-only; versioned sync on explicit write paths |
| `Goal.goalType: moment\|event` | Transitional rows in `tree-data`; retirement not done |
| Trunk layout default on, longitudinal off | Two different “future branch” stories in flight |
| Renderer complexity vs dogfood | Rich materials/staging; risk of AI refactors reintroducing invisible hit targets |

## Transition states

- **Evolve/fork APIs removed** — `parentGoalId` chains remain for display/navigation only; new pursuits/marks primarily via Stream; hub **Add pursuit** kept for explicit manual adds.
- **Radial theme-star → trunk grammar** — Trunk default on; radial restorable via env.
- **JSON treeMilestones → relational** — Complete; projection is single source for hex.
- **Bottom-sheet moment panel → MarkHoverCard** — Complete for tree.
- **Bloom vocabulary migration** — `normalizeLegacyBloomStatus` bridges old rows; some prose/docs still use pre-2026-05-18 terms.
- **Progressive hub reveal** — `isActive` / `isSystemHub`; onboarding activates subset.

## Evolving direction (inferred)

1. **Stream as primary intake** — Theme/hub brain dump, cross-session dedup (`StreamSession`), enrich sparse titles, status updates without duplicate goals.
2. **Longitudinal branch grammar** — When flag ships: unified hub timeline + pursuits on one growing ray; retires domain-cluster goal orbit as default.
3. **Map-as-workspace** — Edit map, unresolved marks on canvas, hub catalog copy for AI routing.
4. **Render-only polish without data churn** — Staging, materials, milestone symbology continue to iterate in `tree-*` modules.
5. **Taxonomy stability** — v6 hub catalog with `aiRoutingNote`; fewer hubs (17); legacy label migrations centralized in `hub-taxonomy-sync`.

## What to preserve in refactors

- Ontology boundaries (hub vs pursuit vs milestone vs mark).
- `milestoneDoneForSemantics` as single completion truth.
- Flag-gated layout grammars with rollback paths.
- Narrow hit targets and edit-map/pan mutual exclusion.
- `mapToTreeData` as the one assembly gate before SVG.

**Pointers:** `docs/current-focus.md`, `docs/STREAM.md`, `ONTOLOGY.md`, `GLOSSARY.md`, `DECISIONS.md`, `docs/STABILIZATION.md`, `BRIEF.md`, `docs/README.md`, `DESKTOP-ON-HOLD.md`.
