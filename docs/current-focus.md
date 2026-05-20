# Current focus (inferred May 2026)

Practical snapshot for contributors and AI sessions. Revisit after major changelog entries.

## Likely priorities

1. **Dogfood / stabilization** — Relational milestones, Stream E2E, edit-map, mark hover UX; fix payload/regression bugs before new subsystems (`docs/STABILIZATION.md` QA checklist).
2. **Stream product loop** — Extract → confirm → commit; ambiguous-on-map; status-only updates; enrich sparse context; theme session dedup.
3. **Tree interaction polish** — Left rail panels, gateway/hub/pursuit hits only, edit-map reorganize, unresolved mark resolution.
4. **Hub taxonomy v6** — 17 hubs, catalog copy, `aiRoutingNote` in extract; progressive activation.
5. **Longitudinal layout (behind flag)** — `BRANCH_LONGITUDINAL_ALL` off in `flags.ts`; geometry and APIs ready; visual sign-off pending before default-on.

## Active refactor directions

| Area | Direction |
|------|-----------|
| Layout | Trunk grammar live; longitudinal grammar opt-in; domain-cluster still default visual |
| Intake | Evolve removed → Stream only for new pursuits/marks |
| Panels | Rail for theme/hub/pursuit; marks off rail (hover card) |
| Ordering | `sequencePosition` + `branch-sequence.ts` anchors across goals and marks |
| Bloom | Simplified enum (`ACTIVE`/`ON_HOLD`/`COMPLETE`); milestone-driven recompute |
| Taxonomy | Sync-on-read branches; locked templates; finance hub renames absorbed |

## Systems under evolution

- **`tree-branch-geometry.ts`** — Dual paths for domain-cluster vs longitudinal; large surface area.
- **Stream stack** — `stream-extract`, `stream-commit`, confirmation UI, `resolve-ambiguous`.
- **Edit map** — `tree-edit-map-*`, `goal-reorganize`, reorganize API.
- **Hub catalog / AI routing** — `hub-catalog.ts` feeding extract prompts.
- **Visual materials** — `tree-render-staging`, `tree-render-materials`, goal ambient breathe (post-uniform-limb-brightness pass).

## Short-term goals (reasonable)

- Pass stabilization QA (Stream, edit-map, marks, archive, milestone→bloom).
- Flip `BRANCH_LONGITUDINAL_ALL` locally until layout acceptable, then consider default-on.
- Retire `Goal.goalType moment|event` rows and `/api/moments` paths once longitudinal stable.
- Ensure every milestone/subtask mutation calls `recomputeGoalBloomStatus`; run `backfill:goal-bloom` after bulk fixes.
- Commit or reconcile WIP called out in `CHANGELOG.md` (2026-05-16 section noted as possibly uncommitted on older HEAD).

## Do not rewrite right now

- **`mapToTreeData` / `tree-types` assembly** — Central; touch only with full payload understanding.
- **`milestone-semantics.ts` + `goal-bloom-lifecycle.ts`** — Converged truth; changes need explicit product sign-off.
- **Taxonomy sync semantics** — Moving off `GET /api/branches` mutation is a dedicated sprint, not a drive-by.
- **Full tree-svg decomposition** — Already split; avoid re-monolithing or parallel render pipelines.
- **Prisma schema renames** (`limbId`, `Branch`, `GoalFork`) — Cosmetic rename pass deferred; high churn/low user value.
- **Re-adding Evolve/fork APIs or limb polygon click targets** — Explicitly removed May 2026.

## Operational constraints

- **`GEMINI_API_KEY`** required for Stream extract/enrich and several parse routes.
- **Restart `next dev`** after `NEXT_PUBLIC_*` flag changes.
- **Backfills** before/after migrations on old DBs (`backfill:tree-milestones`, `backfill:node-sequence`, `backfill:goal-bloom`).
- **E2E** — `milestone-bloom-evolve`, `stream-confirmation-cards`; seed tree test user.
- **Default home** — `/tree` after onboarding.
- **Read `AGENTS.md` / `ONTOLOGY.md`** before tree, bloom, or continuation edits.

## Success signals for this phase

- Stream changes map state reliably without duplicate pursuits on status dumps.
- Hex dots match relational milestones (first six by position).
- Edit map does not fight pan or panel open.
- No regression of invisible limb hit stealing map clicks.
