# Anti-patterns (compressed)

Patterns the architecture **appears to resist**, plus **regression risks** for human and AI contributors.

## Intentionally avoided

### Ownership-heavy coupling
- Tree SVG reaching into Prisma or calling APIs directly for business rules.
- Scattered bloom/milestone completion checks instead of `milestoneDoneForSemantics` / `goal-bloom-lifecycle.ts`.

### Rigid single layout
- One geometry path for all themes—replaced by grammar bundles + flags (trunk, domain-cluster, longitudinal).
- Storing hub SVG coordinates as source of truth for taxonomy layout.

### Local rendering hacks that bypass assembly
- Computing goal/mark positions in components instead of `tree-branch-geometry` + `mapToTreeData`.
- Second milestone store (JSON on goal) or panel-only milestone state.

### Excessive branching in product flows
- Duplicate intake: Evolve + Stream + ad-hoc modals for the same “new pursuit” (Evolve removed—do not resurrect silently).
- Ambiguous items in Stream confirmation **and** on map.

### Premature abstraction
- Generic “layout engine” over the explicit constant tables (`tree-view-constants`, trunk slots, anchors).
- Shared “node” model merging Goal and Mark persistence.

### Over-fragmented tree components
- Note: tree is already split (`tree-svg`, `tree-panel`, geometry modules)—avoid **further** splintering without cohesion; also avoid re-monolithing `tree-view.tsx`.

### Visual rigidity
- Whole-limb opacity multipliers that make areas feel disabled (historical desktop tree — do not revive).
- Literal flower art instead of milestone-driven geometry (orbital hex, chords, ambient halo).

### Duplicated semantic logic
- Subtask rollup defining milestone done when `completedAt` should win.
- Bloom derived from `forkedGoals.length` or continuation count.
- Stream creating marks with `pursuitRef` or pursuit-panel add-mark.

### Map interaction anti-patterns
- Large transparent limb polygons / stem strokes as click targets.
- Pan enabled during edit-map.
- Timeline notes in bottom-sheet `TreePanel` as primary detail (superseded by `MarkHoverCard`).

### Terminology drift
- New `thread*` domain identifiers or user-facing “thread” for continuations.
- User-facing “fork” without qualifier (layout vs removed evolution API vs legacy branch split).
- “Life area” / “branch line” in new copy where **theme** / **hub** suffice.

## Regression risks (high)

| Risk | Symptom | Guard |
|------|---------|--------|
| Missing milestones in branch payload | Empty hex, panel mismatch | Nested include on `GET /api/branches`; E2E |
| Stale `ACTIVE` after all milestones done | Wrong badge/bloom | `recomputeGoalBloomStatus` on every milestone write; `backfill:goal-bloom` |
| Longitudinal flag on without sequence backfill | Overlapping nodes | `backfill:node-sequence` |
| Taxonomy sync side effects in tests | Flaky branch counts | Account for sync on GET; use fixtures |
| AI restore domain-cluster-only logic | Breaks insert-and-reflow when flag flips | Edit `tree-renderer-grammar` + geometry together |
| Re-add `BRANCHED` on goals | Lifecycle conflates graph shape | `ONTOLOGY.md` freeze rules |

## Architectural drift vectors

1. **Docs vs code bloom vocabulary** — keep GLOSSARY/ONTOLOGY aligned with `ACTIVE`/`PAUSED`/`COMPLETE`; legacy `ON_HOLD` normalized at read only.
2. **`thread*` in seeds/geometry** — Easy to copy old names into new features.
3. **Dual layout maintenance** — Fixes applied only to domain-cluster or only to longitudinal path.
4. **Stream prompt drift** — Hub routing notes out of sync with `hub-catalog.ts` / taxonomy version.
5. **Read-time taxonomy mutation** — Features assuming immutable branch list after one GET.
6. **Legacy `moment`/`event` goals** — Treated as marks in some paths, goals in others until retirement.
7. **Visual vs persisted bloom** — `deriveGoalNodeRenderState` vs `bloomStatus`; conflating “growing halo” with DB state.

## Dangerous patterns AI refactors often reintroduce

- **Invisible hit areas** “to make the tree easier to click.”
- **Consolidating** `Mark` into `Goal` or milestones into JSON for “simplicity.”
- **Removing flags** and dead code paths before longitudinal visual sign-off.
- **Auto-completing milestones** from subtasks without `completedAt` ritual.
- **New confirmation step** for ambiguous Stream items.
- **Centralizing all tree state** in React context without `mapToTreeData` boundary.
- **Calling sync** from random routes instead of documented entry points.
- **Defaulting `BRANCH_LONGITUDINAL_ALL` true** without hub density / neighbor-wedge QA (known visual risk at high counts).

## When breaking avoidance is justified

Document in `DECISIONS.md` with date + tradeoff if deliberately:
- Moving taxonomy sync off GET.
- Defaulting longitudinal layout on.
- Reintroducing pursuit-scoped notes.
- Adding a second milestone persistence layer.
