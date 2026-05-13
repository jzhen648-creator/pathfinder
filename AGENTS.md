<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Pathfinder domain language

Canonical product words: **theme** (outer pillar — same ids as `LifeAreaId` / `limbId`) and **hub** (named track under a theme; goals and marks attach here). See [`GLOSSARY.md`](./GLOSSARY.md) and [`ONTOLOGY.md`](./ONTOLOGY.md) for full definitions and code vs copy.

Before changing tree, goals, branches, bloom, or continuation behavior, read [`ONTOLOGY.md`](./ONTOLOGY.md), [`GLOSSARY.md`](./GLOSSARY.md), and [`docs/UX-TERMINOLOGY-AUDIT.md`](./docs/UX-TERMINOLOGY-AUDIT.md).

**Stabilization / QA phase:** [`docs/STABILIZATION.md`](./docs/STABILIZATION.md) — dogfood phase after milestone convergence (relational milestones only; freeze guidance; QA checklist). Prefer categorizing fixes there before broad refactors.

**Milestone truth (implementation):** relational `Milestone` / `Subtask` rows are the **only** milestone store (`Goal.treeMilestones` JSON column removed). Hex dots: `src/components/tree/milestone-tree-projection.ts`; panel predicates: `src/components/tree/goal-milestone-predicates.ts`. Bloom: `src/lib/goal-bloom-lifecycle.ts` + `recomputeGoalBloomStatus`.

**Do not** introduce new `thread*` domain identifiers or use **thread** in new user-facing copy for goal continuation (legacy code may still say “thread” for older hub/geometry identifiers).
