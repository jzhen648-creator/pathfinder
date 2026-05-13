# Stabilization phase — operational convergence & QA

This document defines the **stabilization / QA phase** after ontology restructuring (milestones, continuation, terminology). It tells contributors and AI agents what is **canonical**, what is **intentionally transitional**, and what **must not be “fixed” ad hoc** during heavy usage validation.

**Related:** [`ONTOLOGY.md`](../ONTOLOGY.md), [`GLOSSARY.md`](../GLOSSARY.md), [`docs/UX-TERMINOLOGY-AUDIT.md`](./UX-TERMINOLOGY-AUDIT.md).

---

## Current canonical ontology (stable summary)

| Concept | Canonical meaning |
|--------|-------------------|
| **Goal** | One pursuit (`Goal`); roadmap types vs `moment`/`event` per schema. |
| **Milestone** | **One** progression structure per goal: primarily Prisma `Milestone` + optional `Subtask` rows. Tree hex dots are a **projection** of that structure when relational rows exist (see below). |
| **Continuation** | `parentGoalId` / successors; `POST /api/goals/[id]/fork`. Not milestones; not branch taxonomy splits. |
| **Bloom** | Lifecycle only (`BUD` / `GROWING` / `BLOOMED` / `ENDED`); not driven by continuation count. Deprecated **`BRANCHED`** on goals — see [`ONTOLOGY.md`](../ONTOLOGY.md). |
| **Branch line** | Taxonomy `Branch` and SVG strokes — not continuations. |

---

## Milestone convergence direction (where we are heading)

**Target model:** One milestone journey per goal; **roadmap UI** = expanded execution view; **tree hex** = compact spatial view — **same milestones**, not two systems.

**Current implementation state:**

| Layer | Role |
|-------|------|
| **Canonical persistence** | Prisma `Milestone` / `Subtask` (relational). |
| **Tree projection** | `src/components/tree/milestone-tree-projection.ts` — when relational milestones exist, hex dots derive from them (`milestoneIsFullyCompleted` aligned with lifecycle); **`Goal.treeMilestones` JSON is ignored for rendering** if it diverges. |
| **Legacy fallback** | When **no** relational milestones, parsed `treeMilestones` JSON still drives dots until migration/write convergence. |
| **Panel semantics** | `src/components/tree/goal-milestone-predicates.ts` — use these helpers instead of scattered `.length` checks for “does this goal have milestone structure?” |

**Phase 1 write convergence (implemented):** tree panel “Add step…” / AI suggest chips call **`POST /api/goals/[goalId]/milestones`** → relational `Milestone` rows (**no** auto-subtasks; milestone completion is explicit `completedAt` / tap-stage, with substeps optional), **`recomputeGoalBloomStatus`**, existing projection + lifecycle normalization unchanged. First append on a JSON-only goal **copies** legacy `treeMilestones` into relational rows (JSON column left intact). Legacy **checkbox** edits on JSON-only goals still use **`PATCH`** full JSON. Legacy scaffolding subtasks (auto “Complete this step” / renamed **Optional detail**) are **ignored for rollup** (`milestoneDoneForSemantics` via `isScaffoldingSubtaskTitle`) and **omitted from tree / roadmap / next-steps / dashboard counts**. To remove rows from SQLite entirely: **`npm run backfill:delete-scaffolding-subtasks`**. (Rename-only backfill: **`npm run backfill:rename-legacy-subtasks`**.)

**Not done yet (explicitly deferred):** further write convergence (toggle completion via subtasks only, remove JSON column), lifecycle redesign, changing milestone-without-subtasks semantics in UI.

---

## Continuation semantics (stable)

- Continuations are **orthogonal** to milestones and bloom (except sharing the same `Goal` row).
- UI prefers **continuation** / **related goal** / **Continue this goal** — avoid user-visible **fork**; API route may still be `/fork`.
- Tree panel: **Continued by** / **Continued from** — navigational, not checklist styling.

---

## Lifecycle semantics (observe; do not redesign during stabilization)

**Authoritative rules:** `src/lib/goal-bloom-lifecycle.ts` + server `recomputeGoalBloomStatus` in `src/lib/goal-bloom.ts`.

**Summary:**

- **BUD / GROWING / BLOOMED** for roadmap goals are driven by **relational** milestone + subtask completion — **not** by `treeMilestones` JSON toggles.
- **`normalizeGoalBloomForDisplay`** in tree assembly handles legacy **`BRANCHED`** remapping and **stale BUD reconciliation**: if persistence still says `BUD` but the payload includes relational milestones, display derives **`computeGoalLifecycleBloom`** so the tree matches ontology until DB catches up. JSON-only structure is **not** lifecycle input here.

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
| **`Goal.treeMilestones` JSON** | Still writable via `PATCH /api/goals/[goalId]` when the goal has **no** relational milestones (tree panel “On the tree” edits). Still stored when relational milestones exist but **ignored for hex rendering** (dev console may warn on divergence). |
| **`GET /api/branches` goals payload** | Feeds `mapToTreeData`; must include `milestones` (+ subtasks) and `treeMilestones` for correct tree + panel behavior. |
| **Legacy goal bloom rows** | `BRANCHED` on goals until backfill — see `npm run backfill:goal-bloom`. |
| **Next-steps / roadmap** | Use relational milestones only — JSON-only goals do not appear as structured roadmap milestones elsewhere. |

---

## Known intentional inconsistencies (acceptable during migration)

These are **expected** until write convergence and optional data migration — **not** ad hoc bugs to paper over:

| Phenomenon | Why it exists |
|-------------|----------------|
| **JSON-only goals stay BUD** (typical roadmap goal) | Lifecycle ignores `treeMilestones`; only relational milestones participate in `computeGoalLifecycleBloom`. |
| **Dots show progress; bloom stays BUD** | Same — legacy JSON edits do not call `recomputeGoalBloomStatus`. |
| **Roadmap page empty; tree shows dots** | Roadmap reads relational graph only; JSON-only plans are tree-local until migrated. |
| **>6 relational milestones** | Hex shows **first 6 by `position`** only — tail milestones visible in roadmap list, not all on hex. |
| **Stale `treeMilestones` in DB** when relational rows exist | Ignored for render; harmless noise until cleanup script removes it. |
| **Panel milestone row strike-through** vs **lifecycle “milestone complete”** | Roadmap panel uses `total > 0 && done === total` for visual strike; lifecycle uses **`milestoneIsFullyCompleted`** (empty subtasks = complete). Possible **visual** mismatch — known UX edge, not projection bug. |

---

## True bugs (should be filed and fixed)

| Signal | Likely bug |
|--------|------------|
| **`GET /api/branches` returns goals with empty `milestones` but non-empty derived projection expectations** | Payload / serializer regression — milestones missing from nested include. |
| **Any production path writing `treeMilestones` for goals that already have relational milestones** | Should be unreachable from current tree panel (orbital edits disabled when relational exist) — verify no other client. |
| **Dots and relational list titles systematically disagree** after full reload | Projection or ordering bug — investigate `milestone-tree-projection.ts` + `nestTreeGoalsForBranch`. |

When filing issues during stabilization, tag the **category** (see Freeze guidance below).

---

## Migration state assumptions

- **Read-path convergence** is implemented: relational milestones win for hex projection.
- **Write-path** is **not** converged: JSON PATCH remains for legacy-only goals.
- **Schema:** `treeMilestones` column remains; no requirement to remove during stabilization phase.
- **AI roadmap generation** continues to target relational rows — aligns with projection when data reaches `GET /api/branches`.

---

## Practical manual QA checklist

Use during real testing sessions. Check **Pass / Fail / N/A** and note payload screenshots or goal IDs when something fails.

### Milestone flows

- [ ] Create goal via simple flow → no relational milestones → tree shows no dots (unless legacy JSON added); bloom **BUD**.
- [ ] Add milestones only via **On the tree** (legacy) → dots appear; roadmap page still empty or minimal; bloom unchanged for normal goal types.
- [ ] AI / wizard creates **relational** milestones → roadmap lists them; tree dots match titles/order (first 6); panel **Milestones** lists them once (tree map is projection only).
- [ ] Suggest milestones (AI chips) on **legacy-only** goal → titles persist via PATCH JSON; dots update after reload.
- [ ] Suggest milestones disabled when relational milestones exist (read-only projection mode).

### Roadmap / tree coherence

- [ ] Complete subtasks on roadmap → dots update after tree reload; bloom advances when all milestones complete per server rules.
- [ ] Open goal panel: relational goal shows roadmap list + helper lines (“same journey”).
- [ ] Legacy-only goal: panel shows legacy copy block + editable **On the tree** section.
- [ ] Goal with **>6** milestones: hex shows 6; list shows all.

### Lifecycle transitions

- [ ] First relational milestone appears → expect **GROWING** after recompute (observe badge).
- [ ] Last subtask completed across milestones → **BLOOMED** (unless ENDED).
- [ ] JSON-only toggles **do not** flip bloom alone.

### Continuation flows

- [ ] Continue this goal → successor created; parent recomputed; navigation opens successor when intended.
- [ ] Continued from / Continued by links navigate correctly.

### Legacy compatibility

- [ ] Existing JSON-only demo/profile goals still editable under **On the tree** until migrated.
- [ ] Dev-only console warning when JSON differs from relational projection (development only).

### Payload consistency

- [ ] Network: `GET /api/branches` each goal used on tree has `milestones` array shape expected by `RawTreeGoalPayload` (ids, titles, positions, subtasks).
- [ ] After `PATCH` treeMilestones (legacy), reload: dots match payload fallback path.
- [ ] Roadmap `getGoalWithProgress` matches user expectations for same goal (relational only).

---

## Known risks before write convergence

| Risk | Mitigation |
|------|------------|
| **Dual authoring** (JSON + relational) | Users or tools PATCH JSON while relational exists → DB drift; render ignores JSON but confusion persists — prioritize write convergence after stabilization. |
| **Suggest / chip flows** still JSON-only | Can strand plans off roadmap — document; converge to `Milestone` create later. |
| **next-steps / BRANCHED edge** | Serializer may treat stale `BRANCHED` oddly — separate backlog if seen in QA. |
| **Dashboard / other surfaces** | Some code uses `goal.milestones[...]` — validate non-tree surfaces with same profile data. |

---

## Future convergence preparation (documentation only — not implemented)

**Intended direction**

1. Tree-first edits create/update/toggle **relational** `Milestone` / `Subtask` rows (or a single facade API).
2. **`PATCH /api/goals/[id]`** `treeMilestones` retired or restricted to migration/admin after backfill.
3. Each mutation triggers **`recomputeGoalBloomStatus`** where appropriate (already on subtask complete).

**Likely deprecation path for `treeMilestones`**

1. Stop new JSON writes from product UI (after relational CRUD exists).
2. Script: JSON-only goals → insert `Milestone` rows; clear JSON.
3. Remove column only after dual-read period ends.

**Why dual-authoring is dangerous**

- Two stores imply two truths; projection hides one only on **read**, not in DB or user mental model.
- AI and analytics should read one graph — relational wins long-term.

---

## Freeze guidance (stabilization phase)

**During this phase, prefer observation over reactive refactors.**

### Avoid

- Major ontology redesign
- Schema churn (unless blocking prod incidents)
- Broad renames across codebase
- Lifecycle rule changes without explicit approval post-QA
- Removing `treeMilestones` / JSON paths
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
| JSON PATCH | `src/app/api/goals/[goalId]/route.ts`, `src/lib/validation/patch-goal-tree-milestones.ts` |

---

*Last aligned with milestone read-path convergence + semantic predicates; update when write convergence lands.*
