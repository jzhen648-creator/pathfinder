# Stabilization phase — operational convergence & QA

This document defines the **stabilization / QA phase** after ontology restructuring (milestones, continuation, terminology). It tells contributors and AI agents what is **canonical**, what is **intentionally transitional**, and what **must not be “fixed” ad hoc** during heavy usage validation.

**Related:** [`ONTOLOGY.md`](../ONTOLOGY.md), [`GLOSSARY.md`](../GLOSSARY.md), [`docs/UX-TERMINOLOGY-AUDIT.md`](./UX-TERMINOLOGY-AUDIT.md).

---

## Current canonical ontology (stable summary)

| Concept | Canonical meaning |
|--------|-------------------|
| **Goal** | One pursuit (`Goal`); roadmap types vs `moment`/`event` per schema. |
| **Milestone** | **One** progression structure per goal: Prisma `Milestone` + optional `Subtask` rows only. Tree hex dots are a **projection** of those rows (`milestone-tree-projection.ts`). |
| **Continuation** | `parentGoalId` / successors; existing chains render on the tree. Not milestones; not branch taxonomy splits. New pursuits via **Stream** (fork API removed May 2026). |
| **Bloom** | Lifecycle only (`BUD` / `GROWING` / `BLOOMED` / `ENDED`); not driven by continuation count. Deprecated **`BRANCHED`** on goals — see [`ONTOLOGY.md`](../ONTOLOGY.md). |
| **Branch line** | Taxonomy `Branch` and SVG strokes — not continuations. |
| **Timeline note** | Prisma `Mark` on a **hub** only; canvas = lateral diamond; detail = `MarkHoverCard`. |
| **Unresolved Stream item** | `Mark.needsResolution` — resolve on tree, not in confirmation queue. |
| **Edit map** | Drag reorganize pursuits; `POST /api/goals/[goalId]/reorganize`. |

---

## Milestone model (converged — May 2026)

**Canonical model:** One milestone journey per goal; **roadmap UI** = expanded execution view; **tree hex** = compact spatial view — **same relational milestones**, not two stores.

| Layer | Role |
|-------|------|
| **Canonical persistence** | Prisma `Milestone` / `Subtask` only. **`Goal.treeMilestones` JSON column removed** (migration `20260513220000_drop_goal_tree_milestones`). |
| **Tree projection** | `src/components/tree/milestone-tree-projection.ts` — hex dots from relational rows; `milestoneIsFullyCompleted` aligned with lifecycle. |
| **Writes** | `POST /api/goals/[goalId]/milestones`, `PATCH .../milestones/[milestoneId]` (`completedAt` + `recomputeGoalBloomStatus`). `PATCH /api/goals/[goalId]` is **title / description / significance only** — no milestone JSON. |
| **Panel semantics** | `src/components/tree/goal-milestone-predicates.ts` — use these helpers instead of scattered `.length` checks. |
| **AI / create flows** | `persistGeneratedRoadmapForGoal` and conversational create write relational rows. |

**Backfill (old DBs only):** `npm run backfill:tree-milestones` copies legacy JSON into relational rows **before** applying the drop-column migration.

**Scaffolding subtasks:** Auto “Complete this step” / **Optional detail** placeholders are ignored for rollup (`milestoneDoneForSemantics` via `isScaffoldingSubtaskTitle`) and omitted from tree / roadmap / next-steps / dashboard counts. Cleanup: `npm run backfill:delete-scaffolding-subtasks` (rename-only: `npm run backfill:rename-legacy-subtasks`).

**Explicitly deferred:** `BRANCHED` enum removal from schema; `thread*` naming pass in seeds/layout JSON; Stream UI.

---

## Continuation semantics (stable)

- Continuations are **orthogonal** to milestones and bloom (except sharing the same `Goal` row).
- **`Goal.parentGoalId`** links successor goals to a predecessor; tree layout uses **`continuationChildScreenPosition`** (hub-ray satellites).
- **Evolve / fork APIs removed (May 2026).** New pursuits and marks are added via **Stream** or hub/goal create flows — not via fork.
- Tree panel: **Continuations** list and **Continues from** — navigational links between existing parent/child rows only.

---

## Lifecycle semantics (observe; do not redesign during stabilization)

**Authoritative rules:** `src/lib/goal-bloom-lifecycle.ts` + server `recomputeGoalBloomStatus` in `src/lib/goal-bloom.ts`.

**Summary:**

- **BUD / GROWING / BLOOMED** for roadmap goals are driven by **relational** milestone + subtask completion (`milestone-semantics.ts`).
- **`normalizeGoalBloomForDisplay`** in tree assembly handles legacy **`BRANCHED`** remapping and **stale BUD reconciliation**: if persistence still says `BUD` but relational milestones exist, display derives **`computeGoalLifecycleBloom`** until DB catches up.

During stabilization: **document** felt inconsistencies (see below); **do not** change lifecycle rules without an explicit post-stabilization proposal.

### Stale bloom repair (DB vs tree)

- **Symptom:** `Goal.bloomStatus` stays **`BUD`** while **`Milestone` rows** exist — usually missing **`recomputeGoalBloomStatus`** on a write path during migration.
- **Display:** Tree/read paths reconcile obvious **BUD + milestones** contradictions in `normalizeGoalBloomForDisplay` (dev console warns with goal id when detected).
- **Persistence:** Run **`npm run backfill:goal-bloom`** after bulk imports or schema fixes to align stored bloom with `computeGoalLifecycleBloom`. Safe to run repeatedly; skips **ENDED** goals.
- **Risk window:** Until every relational milestone/subtask mutation calls recompute, non-tree surfaces that read raw `bloomStatus` without normalization may still show stale **BUD** — prioritize fixing writers + periodic backfill.

---

## Known temporary compatibility layers

| Layer | Behavior |
|-------|----------|
| **`GET /api/branches` goals payload** | Feeds `mapToTreeData`; must include nested `milestones` (+ subtasks). |
| **Legacy goal bloom rows** | `BRANCHED` enum value may linger on old rows — run `npm run backfill:goal-bloom`; read-time normalization remaps for display. |
| **`thread*` naming in code** | Seeds / layout JSON may still say `threadType`, `threadIdx` — cosmetic rename pass only; no `thread*` DB columns. |

---

## Known intentional inconsistencies (acceptable during stabilization)

| Phenomenon | Why it exists |
|-------------|----------------|
| **>6 relational milestones** | Hex shows **first 6 by `position`** only — tail milestones visible in roadmap list, not all on hex. |
| **Panel milestone row strike-through** vs **lifecycle “milestone complete”** | Roadmap panel uses `total > 0 && done === total` for visual strike; lifecycle uses **`milestoneIsFullyCompleted`**. Possible **visual** mismatch — known UX edge, not projection bug. |
| **Parent/child lineage on tree** | Continuation list in panel; flow segments on domain-cluster layout; no new fork API. |

---

## True bugs (should be filed and fixed)

| Signal | Likely bug |
|--------|------------|
| **`GET /api/branches` returns goals with empty `milestones` but tree expects dots** | Payload / serializer regression — milestones missing from nested include. |
| **Dots and relational list titles systematically disagree** after full reload | Projection or ordering bug — investigate `milestone-tree-projection.ts` + `nestTreeGoalsForBranch`. |
| **Bloom stays BUD after completing all milestones** | Missing `recomputeGoalBloomStatus` on a write path — run `npm run diagnose:milestone-recompute`. |

When filing issues during stabilization, tag the **category** (see Freeze guidance below).

---

## Migration state (May 2026)

- **Milestone read + write convergence: done.** Relational only; JSON column dropped.
- **Bloom backfill:** `npm run backfill:goal-bloom` — safe to re-run; skips **ENDED** goals.
- **Old DBs:** run `npm run backfill:tree-milestones` before `prisma migrate deploy` if upgrading from pre-drop schema.
- **Regression shield:** `e2e/milestone-bloom-evolve.spec.ts` (milestone → bloom only).

---

## Practical manual QA checklist

Use during real testing sessions. Check **Pass / Fail / N/A** and note payload screenshots or goal IDs when something fails.

### Milestone flows

- [ ] Create goal → add milestones via **Add step…** or AI suggest → relational rows appear on roadmap and tree.
- [ ] AI / wizard / `generateRoadmap` creates relational milestones → roadmap lists them; tree dots match titles/order (first 6).
- [ ] Complete milestones via tree panel ritual row or roadmap subtasks → bloom advances; hex dots update after reload.
- [ ] Goal with **>6** milestones: hex shows 6; roadmap list shows all.

### Roadmap / tree coherence

- [ ] Open goal panel: milestone list matches roadmap; hex is projection only.
- [ ] Complete last milestone → **Goal achieved** banner (dismiss only).

### Lifecycle transitions

- [ ] First relational milestone → **GROWING** after recompute.
- [ ] All milestones complete → **BLOOMED**.

### Continuation flows (existing data)

- [ ] **Continues from** / **Continuations** list navigate correctly for legacy `parentGoalId` chains.

### Payload consistency

- [ ] `GET /api/branches` each goal has `milestones` array (ids, titles, positions, subtasks, `completedAt`).
- [ ] Roadmap `getGoalWithProgress` matches tree for the same goal.

### Automated regression

- [ ] `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e -- milestone-bloom-evolve` passes (after `npm run seed:tree` for dev user).

### Stream (theme / hub)

- [ ] **Tell me about this** on theme panel → theme Stream extract → confirm pursuits / marks → tree updates.
- [ ] Hub Stream adds items on the correct hub only.
- [ ] Status-only dump (“finished X”) updates bloom on existing pursuit — no duplicate pursuit.
- [ ] Ambiguous extract → dashed `?` on tree → resolve Done / In progress / Not started → mark normalizes.

### Panels & marks

- [ ] Theme / hub / pursuit open in **left rail**; mark uses **hover card** (no bottom-sheet moment panel).
- [ ] **Add mark** only on hub panel; pursuit panel has no add-mark.
- [ ] Archive pursuit or mark → hidden from tree → revive from hub archive section.

### Edit map & map chrome

- [ ] **Edit map** on → pan disabled; drag pursuit to hub ring / nest target / branch slot → silent reload.
- [ ] Edit map off during active Stream session.
- [ ] Clicking open map (not on a node) dismisses panel; limb backdrop does **not** steal clicks.
- [ ] Theme gateway / hub hit / pursuit hex still open correct panels.

### Sparse context

- [ ] Short mark or pursuit title → **Want to add more context?** → enrich updates description.

---

## Known risks (post-convergence)

| Risk | Mitigation |
|------|------------|
| **Stale `Goal.bloomStatus` in DB** | `recomputeGoalBloomStatus` on milestone writes; periodic `npm run backfill:goal-bloom`. |
| **`BRANCHED` enum / stale rows** | Backfill + read-time normalization; enum removal deferred. |
| **Tree renderer coupling** | Freeze geometry files during dogfood — see Freeze guidance. |
| **Dashboard / non-tree surfaces** | Validate bloom and milestone counts match tree/roadmap for same profile. |

---

## Deferred (documentation only — not stabilization blockers)

- Mark drag-and-drop on branch (API supports `sequenceAnchor` on `PATCH /api/marks/[id]`; UI not wired)
- Visual parent→child lineage on the SVG tree
- `BRANCHED` enum value removal from Prisma
- `thread*` → `hub*` cosmetic rename in seeds/layout JSON

---

## Freeze guidance (stabilization phase)

**During this phase, prefer observation over reactive refactors.**

### Avoid

- Major ontology redesign
- Schema churn (unless blocking prod incidents)
- Broad renames across codebase
- Lifecycle rule changes without explicit approval post-QA
- Large tree rendering rewrites

### Prefer

- Heavy real usage of tree + roadmap + continuation flows
- Filing issues with clear **category**:

| Category | Use when |
|----------|----------|
| **Ontology issue** | Conceptual disagreement — defer unless blocking |
| **Payload bug** | API/client shape incomplete or wrong |
| **Mutation divergence** | Write path inconsistent with read projection |
| **UX inconsistency** | Copy/layout confusion — small fixes OK if scoped |
| **Intentional temporary compatibility** | Matches tables above — document, don’t “fix” |

### Exit criteria (team-defined)

Examples: N weeks of dogfood, checklist largely green, prioritized backlog for write convergence only — **not** part of this document’s mandate.

---

## Quick pointers (implementation map)

| Topic | File(s) |
|-------|---------|
| Milestone projection | `src/components/tree/milestone-tree-projection.ts` |
| Panel / structure predicates | `src/components/tree/goal-milestone-predicates.ts` |
| Tree assembly | `src/components/tree/tree-data.ts` (`nestTreeGoalsForBranch`, `mapToTreeData`) |
| Tree panel UX | `src/components/tree/tree-panel.tsx` |
| Lifecycle pure rules | `src/lib/goal-bloom-lifecycle.ts` |
| Lifecycle persist | `src/lib/goal-bloom.ts` |
| Milestone CRUD | `src/app/api/goals/[goalId]/milestones/`, `src/lib/milestone-semantics.ts` |
| Goal PATCH (metadata only) | `src/app/api/goals/[goalId]/route.ts`, `src/lib/validation/update-goal.ts` |
| Stream intake | `src/app/api/stream/extract`, `src/lib/ai/stream-extract.ts` |
| E2E critical path | `e2e/milestone-bloom-evolve.spec.ts` |

---

*Last aligned: milestone convergence, Evolve removed (Stream replaces fork UX), e2e bloom-only — May 2026.*
