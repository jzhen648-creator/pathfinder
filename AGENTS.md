<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Pathfinder domain language

**Active client:** `pathfinder-mobile/` — see workspace [`START-HERE.md`](../START-HERE.md). **Bugs / audits:** [`../PATHFINDER-QA-PLAN.md`](../PATHFINDER-QA-PLAN.md). **Stream behaviour:** [`docs/STREAM.md`](./docs/STREAM.md). **Doc index:** [`docs/README.md`](./docs/README.md). **What shipped:** [`CHANGELOG.md`](./CHANGELOG.md) + [`DECISIONS.md`](./DECISIONS.md). Historical vision: [`docs/archive/VISION.md`](./docs/archive/VISION.md). Desktop UI frozen: [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md).

Canonical product words: **theme** · **category** · **pursuit** · **status** (UI) — `themeId` · `categoryId` · `Goal` · `status` (persistence). **Mark** is schema-only on mobile (no UI). Mobile UI copy: [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md). Persistence: [`GLOSSARY.md`](./GLOSSARY.md), [`ONTOLOGY.md`](./ONTOLOGY.md).

Before changing tree, goals, branches, bloom, or continuation behavior, read [`ONTOLOGY.md`](./ONTOLOGY.md) and [`GLOSSARY.md`](./GLOSSARY.md). Do not extend desktop tree UI unless asked — [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md).

**Stabilization / QA phase:** [`docs/STABILIZATION.md`](./docs/STABILIZATION.md) — dogfood phase after milestone convergence (relational milestones only; freeze guidance; QA checklist). Prefer categorizing fixes there before broad refactors.

**Milestone truth (implementation):** relational `Milestone` / `Subtask` rows are the **only** milestone store (`Goal.treeMilestones` JSON column removed). Hex dots: `src/components/tree/milestone-tree-projection.ts`; panel predicates: `src/components/tree/goal-milestone-predicates.ts`. Bloom: `src/lib/goal-bloom-lifecycle.ts` + `recomputeGoalBloomStatus`.

**Do not** introduce new `thread*` domain identifiers or use **thread** in new user-facing copy for goal continuation (legacy code may still say “thread” for older hub/geometry identifiers).

**Tree UX (May 2026):** Product summary in [`BRIEF.md`](./BRIEF.md). Stream from theme/hub panels only. Marks = hub-level + `MarkHoverCard`. Edit map: `tree-edit-map-overlay.tsx`, `POST /api/goals/[goalId]/reorganize`, `lib/goal-reorganize.ts`. Do not re-add wide limb polygon/stem click targets without an explicit product decision.
