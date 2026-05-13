# Pathfinder ontology

Canonical relationships between persisted entities and derived UI concepts. Use this with [`GLOSSARY.md`](./GLOSSARY.md) for naming.

## Core entities

| Concept | Implementation | Notes |
|--------|------------------|--------|
| **Theme** | Fixed ids (`finance`, `work`, …); legacy DB column name `limbId`; code type `LifeAreaId` | Big pillar of the map — **catalog slice of life**, not a table. Older docs said **life area**. |
| **Hub** | Root `Branch` row under a theme (`branchId` on goals / `Mark`) | Named track (e.g. Family, Skills); **where goals and timeline notes attach** in product language. |
| **Branch** | Prisma `Branch` | Persisted taxonomy row for a hub; owns timeline notes (`Mark`) and goals via `branchId`. **`parentBranchId` / `turningPointId`** exist for **legacy** split rows only — **creating new splits from the tree is removed** (2026-05). |
| **Goal evolution** | `Goal.parentGoalId` → predecessor; `forkedGoals` / API “fork” → successors | Longitudinal **next chapter**. Older docs said **continuation**. **Not** milestone nesting. |
| **Goal** | Prisma `Goal` | One transformational pursuit. Types include roadmap projects and timeline-style `moment` / `event`. |
| **Milestone** | Prisma `Milestone` | Roadmap **phase within a single goal** only; never models goal-to-goal evolution. |
| **Timeline note** | Prisma `Mark` | Dated checkpoint on a hub (via `branchId`). Prefer **timeline note** in new user copy; model name stays **`Mark`**. |

## Bloom (goal lifecycle)

Bloom describes **maturity of one goal**, not graph shape.

| Status | Meaning |
|--------|---------|
| **BUD** | No milestones yet (roadmap goals); special rules for `moment` / `event` without milestones. |
| **GROWING** | Milestones exist; pursuit active / not fully achieved. |
| **BLOOMED** | Goal achieved. |
| **ENDED** | User abandoned or stopped (explicit flow). |

**`BRANCHED`** on `Goal` rows is **deprecated**: it historically reflected “has evolution successors” and mixed topology with lifecycle. **Do not assign `BRANCHED` from recomputation.** Prefer `npm run backfill:goal-bloom` to normalize legacy rows.

`BloomStatus.BRANCHED` may still appear on **timeline/moment** derivation (legacy `isTurningPoint` markers, etc.) — that is separate from goal lifecycle semantics.

## Deprecated vocabulary

- **`thread` / `threadIdx` / `ThreadData`** — legacy names for **branch-line rendering and taxonomy seeds**, not continuations. **Do not** introduce new `thread*` domain identifiers. See Glossary “Deprecated aliases.”

## Dangerous collisions (for authors & AI)

| Term | Ambiguity |
|------|-----------|
| **Fork** | SVG layout fork vs `POST /api/goals/[id]/fork` (**goal evolution**) vs legacy **branch split** data. Qualify: **layout fork**, **evolve goal (fork API)**, **legacy split row**. |
| **Branch** | Prisma `Branch` vs generic English. In **UI copy**, prefer **hub** for the user’s track; use **Branch** when discussing the **persisted row** or migrations. |
| **Hub** | User’s track vs Prisma **`Branch`** row (one root `Branch` per hub slot). Qualify **hub (root Branch)** when ambiguous. |
| **Theme** vs **`LifeAreaId` / `limbId`** | Same ids — **theme** is the product word; code symbols stay until an optional rename pass. |
| **Child** | `TreeGoalNode.childGoals` = successor goals for layout (goal evolution); not “subtasks.” |

## Terminology policy (permanent)

**Preferred nouns (product copy)**

| Use | For |
|-----|-----|
| **Theme** | The outer pillar (Money & Finance, Work & Learning, …); same ids as `LifeAreaId` / `limbId`. |
| **Hub** | Named track under a theme; where goals and timeline notes “live” in the UI. |
| **Branch** | Prisma `Branch` row, `branchId` — **implementation** and migrations (legacy split columns may still exist on old rows). |
| **Goal** | One pursuit (`Goal`) |
| **Milestone** | Phase inside one goal only |
| **Goal evolution** / **Evolve goal** | `parentGoalId` chain, `POST .../fork` (older prose: **continuation**) |
| **Bloom** / **lifecycle** | `bloomStatus` maturity only (**BUD** / **GROWING** / **BLOOMED** / **ENDED**) |

**Forbidden (new work)**

- New **`thread*`** domain identifiers (`threadId`, `Thread` model, user-facing “thread” for goal evolution).
- Equating **evolution count** with **bloom** or **`BRANCHED`** on goals.
- Calling goal evolution **subgoals** or **child threads** in product copy.
- New user-facing **life area** / **branch line** where **theme** / **hub** is clearer (keep old words only when quoting legacy docs or code symbols).

**Goal evolution semantics**

- Multiple successors from one goal are allowed (DAG); UI may cap visible nodes for layout.
- **Relation name `GoalFork`** is legacy; treat as **evolution graph**, not nesting.

**Lifecycle semantics**

- Bloom never derives from “has children.” Use `src/lib/goal-bloom-lifecycle.ts` rules only.

**Anti-patterns**

- User-visible **fork** without context (reserve for git-savvy power copy or qualify **evolve this goal**).
- Using **thread** in new strings — prefer **hub** for tracks, **goal evolution** for successor goals.
- Mixing **legacy split-row** vocabulary with **goal evolution** in the same sentence without distinguishing them.

**Freeze rules (until wider rename passes)**

1. No new **`thread*`** domain concepts (`threadId`, `Thread` model, etc.).
2. Goal evolution logic uses **`parentGoalId`** / existing fork API; prefer prose **evolve goal** / **goal evolution** in new UI copy.
3. Goal bloom recomputation must **not** depend on `forkedGoals.length`.

## References

- User-visible audit & UX notes: [`docs/UX-TERMINOLOGY-AUDIT.md`](./docs/UX-TERMINOLOGY-AUDIT.md)
- **Stabilization phase** (canonical vs transitional, QA checklist, freeze rules): [`docs/STABILIZATION.md`](./docs/STABILIZATION.md)
- **Milestone projection** (hex dots from relational milestones; legacy JSON fallback): `src/components/tree/milestone-tree-projection.ts`
- **Tree panel milestone predicates** (has relational vs legacy-only structure): `src/components/tree/goal-milestone-predicates.ts`
- Pure lifecycle rules: `src/lib/goal-bloom-lifecycle.ts`
- Persisted recompute: `src/lib/goal-bloom.ts`
- Legacy row backfill: `npm run backfill:goal-bloom`
