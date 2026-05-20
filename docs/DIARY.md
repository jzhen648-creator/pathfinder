# Pathfinder dev diary

Short narrative notes so we can recall **why** something feels or behaves a certain way—not only what shipped.

---

## 2026-05-11 — Tree “living geometry” + milestone as symbolic truth

### Rendering (incremental, reversible)

We evolved **hex orbital milestones** without replacing branch geometry or adding literal flower art. Direction: *living energy geometry*—quiet, dark-field, milestone-driven.

1. **Phase 0–1:** `goal-node-render-phase.ts` — `progress01`, `visualPhase`, intensities; soft **dual-layer glow** behind crisp orbitals; **core glyph luminosity** tied to progress so low-zoom still reads vitality.
2. **Coherence:** faint **quadratic chords** between adjacent completed orbitals (under glyphs/disks); **adjacency multiplier** on glow; tiny **branch-out** dot; paint order keeps readability.
3. **Atmosphere (light touch):** harmonizing/bloomed goals get an **asymmetric low-opacity ellipse** (“darkness lifts” locally); **catalog segment** vitality stroke before the goal group; **deterministic organic variance** on chords/glow so nodes feel less templated—not random at runtime.

All of this stays behind existing flags/patterns where applicable; easy to strip per layer.

### Tree map macro composition (staging only)

The SVG tree had started to read as a **balanced viz**: equal weight per life area, little spatial hierarchy. We pushed **cinematic composition** without touching routing, forks, or hull point math—only **`tree-render-staging.ts`** and presentation in **`tree-svg.tsx`** (draw order, per-limb `transform`/`filter`, whole-scene drift, backdrop/vignette gradients, trunk read, hull group opacity as a separate “mass” dial).

**What worked:** asymmetry, **Who I’m Becoming** + **People** as clear dominants, foreground/back separation via tone and stacking, trunk feeling more like a **column** than a centered divider.

**What went wrong once:** whole-limb **`groupOpacityMul`**, **`branchStrokeOpacityMul`**, and a low **`hullMassPresenceMul` floor** stacked too hard—recessive limbs looked **disabled**, not deeper in space.

**Lesson:** at this level of renderer maturity, **global alpha multipliers on entire limbs** are a blunt instrument; hierarchy should lean on **ordering, drift, chroma/contrast**, and **local** thread/material behavior, with opacity nudges kept **near 1** so every territory still feels **inhabited**. We rebased tiers and role rules toward that mindset (hull floor raised, focus dimming softened, intra-limb tip curve tightened rather than crushing conduits).

### Interaction semantics (the deeper fix)

The tree **emotionally** reads milestones/orbitals as the **petal / growth unit**, but the product had wired **completion authority** to **subtask rollup**, plus the vacuous rule **0 subtasks ⇒ milestone complete**—so the UI could look “interactive” while the meaningful unit wasn’t directly nurture-able.

**Decision:** converge on **explicit milestone completion** as primary symbolic truth; subtasks remain **optional depth**.

- **Schema:** `Milestone.completedAt` (nullable).
- **Single helper:** `milestoneDoneForSemantics()` in `milestone-semantics.ts` — explicit `completedAt` wins; else legacy **all subtasks done** only when **≥1 subtask**; **empty milestones are no longer auto-complete**.
- **Consumers:** bloom lifecycle, tree orbital projection, roadmap unlock/completion semantics align on that helper.
- **API:** `PATCH /api/goals/[goalId]/milestones/[milestoneId]` with `{ completed: boolean }`; recomputes goal bloom.
- **Panel UX:** relational milestones use one **ritual row** (full-width control + small orbital metaphor), not a dense milestone checkbox grid; copy clarifies tap stage / substeps optional.

**Caveat:** legacy data that relied on “empty milestone = done” may need a one-off backfill if we want historical bloom parity—deliberately out of the first slice.

### Tree legibility: equal limb brightness + brighter map

Feedback was that **some limbs and outer branches read too dark** relative to the crown, then that **all limbs should match in luminance**, then that the **whole map should feel brighter**.

1. **Uniform limbs (staging + materials):** Stripped plane- and life-area-specific **`limbVisualFilter`**, **`groupOpacityMul` / `branchStrokeOpacityMul` / `hullMassPresenceMul`** tiering in `tree-render-staging.ts`—kept **sort order** and per-limb **`transform`** only; **focus** dimming unchanged. Neutralized **`intraLimbBranchDepthMul`**, **`branchIndexDepthRenderingMul`**, and **`branchDistalCalmOpacityMul01`** so branch groups and fork index no longer darken tips or outers by default.

2. **Global brighten pass (without lifting the void):** Centralized **`TREE_MAP_SURFACE_FILL`** + **`TREE_MAP_SURFACE_RGB`** in `tree-view-constants.ts` so the SVG wrapper, PDF export, and **`limbBackdropSurfaceTint`** share one token—**the fill stays the original near-black `#07060A`** (see follow-up). Pan/zoom root `<g>` uses **`brightness(1.12)`**; atmospheric rects (eco haze, stage falloff, south weight) were **eased** so less stacked gray on top of that base. **`tree-render-materials.ts`** — higher floors on significance, stroke envelope, conduit length calm, slightly higher pressure cap. **`pf-roadmap-theme.ts`** — a touch brighter **light** and **dark** shell surfaces.

**Follow-up — canvas back to “empty black”:** We briefly tried a **lighter** map surface (`#15141e`); it was **reverted**. **`TREE_MAP_SURFACE_FILL`** / **`TREE_MAP_SURFACE_RGB`** are **`#07060A`** / **`{7,6,10}`** again; the low haze rect fill under the eco filter is **`#06050a`** again. Brighter *read* now comes from **filter + strokes + overlays + shell**, not from graying the void.

**Trade-off:** we give up some **automatic depth grading** between life areas; hierarchy now leans on **order, drift/scale, and content-local materials** unless we reintroduce very subtle tiering later.

### Where to look in code

| Topic | Location |
|-------|-----------|
| Milestone done definition | `src/lib/milestone-semantics.ts` |
| Bloom + display normalization | `src/lib/goal-bloom-lifecycle.ts` |
| Hex dots | `src/components/tree/milestone-tree-projection.ts` |
| Tree goal visuals / coherence / env | `tree-render-goals-subtree.tsx`, `tree-svg.tsx`, `goal-node-render-phase.ts` |
| Limb draw order / transforms / uniform brightness | `tree-render-staging.ts`; applied in `tree-svg.tsx` (limb `<g>`, hull volume group); map surface tokens `tree-view-constants.ts` |
| Branch material floors (envelope / conduit / significance) | `tree-render-materials.ts` |
| Roadmap shell canvas tones | `src/components/shell/pf-roadmap-theme.ts` |
| Panel ritual + API wiring | `tree-panel.tsx`, `tree-view.tsx`, `api/goals/.../milestones/[milestoneId]/route.ts` |
| Roadmap progress | `src/lib/roadmap.ts` |

### Tree routing, canopy spacing, and domain-cluster goals (same day — layout pass)

A separate thread iterated **fork geometry**, **macro/archetype spacing**, **hub rendering**, **conduit stroke scales**, **hub sector angle math** (so archetype `fanHalfSpanDeg` actually influences hub fans), **overlap dial-backs**, and **domain-cluster polar layout** — goals on a full **360°** ring with tunable radius **closer to the hub**.

**Why a separate note:** the detail is long and constant-heavy; full file pointers and approximate numeric evolution live in **`docs/tree-layout-changes-2026-05-11.md`**. Use that doc when retuning; trust source constants over diary summaries.

| Topic | Primary locations |
|-------|---------------------|
| Straight fork chords / hub stem | `tree-forks.ts` (`STRAIGHT_LIFE_AREA_BY_ID`, `buildFinanceHubSectorAngles`) |
| Macro per life area | `tree-canopy-macro-composition.ts` |
| Routing personality | `tree-canopy-archetypes.ts` |
| Domain polar positions | `tree-branch-geometry.ts` (`goalScreenPositionDomainCluster`), `tree-view-constants.ts` (`DOMAIN_CLUSTER_*`, `CONDUIT_*`) |
| Gateway / domain hub SVG | `tree-svg.tsx` |

---

## 2026-05-19 — Evolve retired; Stream owns the next chapter

We removed **Evolve this pursuit** and the fork/propose APIs. **Stream** replaces that flow: brain dump → structured pursuits, marks, and milestones. Continuation children (`parentGoalId`) still render on the hub ray via `continuationChildScreenPosition`; existing chains remain navigable in the panel.

## 2026-05-19 — Tree interaction sprint (panels, marks, edit map)

**Panels:** Theme / hub / pursuit moved to a consistent **left rail** and were simplified (Stream entry on theme + hub, status chips on pursuit, hub-only **Add mark**). Timeline notes left the bottom sheet for a **hover card** on the map — marks are hub-scoped, not pursuit checkpoints.

**Stream ambiguous:** Items the model cannot classify no longer clog the confirmation queue. They land on the tree immediately as **unresolved** marks; the user resolves intent on the map. That matches “the map is the source of truth,” not “the queue is the source of truth.”

**Edit map:** Manual reorganize (move hub, nest, reorder) had to coexist with pan and panel taps. We disabled pan in edit mode, use a small drag threshold, and **`POST …/reorganize`** instead of ad-hoc PATCHes. Limb **polygon/line** click targets came out the same week — they were stealing empty-map clicks and fighting edit mode; navigation is **nodes + theme gateway**, not invisible hulls.

---

*Add new dated sections below as the symbolic/interaction story evolves.*
