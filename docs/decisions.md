# Architectural decisions (compressed)

Meaningful **conceptual** choices inferred from structure and May 2026 docs. Implementation trivia omitted. Dated detail: `DECISIONS.md` (repo root).

---

## Map over chat as system of record

**What changed:** Stream commits create/update `Goal` and `Mark` rows; confirmation UI is a gate, not the archive.

**Rationale:** Product thesis—AI dumps need durable spatial structure.

**Tradeoffs:** Requires Gemini, good extract prompts, and hub routing catalog maintenance.

**Implications:** API and UI work must ask “where does this appear on the tree?” first.

---

## Ambiguous Stream items on map, not in queue

**What changed:** `ambiguous[]` → immediate `Mark` with `needsResolution`; confirmation skips those cards.

**Rationale:** Map is truth; queue would block spatial resolution.

**Tradeoffs:** Tree clutter until resolved; hub panel shows unresolved count.

**Implications:** Do not re-queue ambiguous items in Stream confirmation without product reversal.

---

## Marks hub-scoped only

**What changed:** No pursuit-panel add-mark; Stream forbids `pursuitRef` on marks.

**Rationale:** Timeline notes are hub timeline, not pursuit checkpoints.

**Tradeoffs:** Users cannot attach a note directly to a pursuit hex without modeling as goal content.

**Implications:** New features asking “note on goal” violate ontology—use milestones or description.

---

## Relational milestones as single store

**What changed:** Dropped `Goal.treeMilestones` JSON; hex from `milestone-tree-projection.ts`.

**Rationale:** Roadmap and tree must not diverge.

**Tradeoffs:** Hex shows max six orbitals by position; tail only in roadmap/panel.

**Implications:** All milestone writes go through relational APIs + `recomputeGoalBloomStatus`.

---

## Explicit milestone completion semantics

**What changed:** `Milestone.completedAt` + `milestoneDoneForSemantics`; removed “zero subtasks ⇒ done”.

**Rationale:** Orbitals looked interactive while authority lived in subtask rollup.

**Tradeoffs:** Legacy rows may need backfill for historical bloom parity.

**Implications:** Bloom, projection, roadmap unlock must import the helper—never re-derive ad hoc.

---

## Bloom simplified to pursuit status + milestone derivation

**What changed:** Persisted `ACTIVE` | `ON_HOLD` | `COMPLETE`; legacy BUD/GROWING/BLOOMED mapped at read.

**Rationale:** Panel buttons and Stream status updates align with user language.

**Tradeoffs:** Older docs/GLOSSARY still mention four-state lifecycle names; visual “growing” is milestone-driven, not a DB enum.

**Implications:** Use `goal-bloom-lifecycle.ts` and `normalizeGoalBloomForDisplay`; don’t reintroduce `BRANCHED` on goals from fork count.

---

## Evolve removed; Stream replaces goal evolution UX

**What changed:** Fork/propose APIs deleted; `parentGoalId` data kept for layout/links.

**Rationale:** Duplicate intake paths; Stream handles new pursuits and milestones.

**Tradeoffs:** Existing continuation chains are navigational only.

**Implications:** No new fork API; successor goals via Stream or explicit create with `parentGoalId` only if product revives.

---

## Branch sequence + insert-and-reflow (data first)

**What changed:** `sequencePosition` on Goal and Mark; `branch-sequence.ts` anchor resolver; unified `POST .../nodes`.

**Rationale:** Domain-cluster polar layout cannot grow a branch without rotating all nodes.

**Tradeoffs:** Fractional indexing + reindex transactions; dual layout code until longitudinal default.

**Implications:** Any insert API must use anchor resolver; visual flag can lag data model.

---

## Render-only trunk layout migration

**What changed:** `tree-trunk-slots.ts` + `TREE_TRUNK_LAYOUT` replaces radial theme-star for gateways.

**Rationale:** Cinematic trunk column composition without DB layout coordinates.

**Tradeoffs:** Two gateway math paths; env toggle for instant rollback.

**Implications:** Trunk work stays in render modules; don’t persist SVG coords for taxonomy hubs.

---

## Progressive hub reveal

**What changed:** 17 `isSystemHub` branches; `isActive` gates tree visibility; onboarding activates subset.

**Rationale:** Map grows with user; avoid empty 17-hub overwhelm.

**Tradeoffs:** Sync and activation logic must stay consistent with seeds/wipes.

**Implications:** Tree load filters inactive roots; feature work must respect `branchIsActiveOnTree`.

---

## Taxonomy sync on branch read

**What changed:** `syncHubTaxonomyForUser` on `GET /api/branches`.

**Rationale:** Keep all users on locked template despite renames/migrations.

**Tradeoffs:** Read endpoint mutates DB; surprising in tests and multi-tab.

**Implications:** Don’t assume GET is side-effect free; moving sync to login is a future decision, not a silent change.

---

## Interaction: nodes and gateway, not limb backdrops

**What changed:** Removed clicks on limb hulls, wide stems, branch-line labels; focus from theme icon.

**Rationale:** Invisible geometry stole pan, edit-map, and empty-map dismiss.

**Tradeoffs:** Less “click anywhere on limb” affordance.

**Implications:** AI refactors must not restore large transparent hit polygons without explicit approval.

---

## Edit map via reorganize API

**What changed:** Toolbar mode; `POST .../reorganize` (`moveToHub`, `reparent`, `sequenceAnchor`); pan off while editing.

**Rationale:** Ad-hoc PATCHes couldn’t express cascade rules (theme scope, max children, cycles).

**Tradeoffs:** Complex server rules in `goal-reorganize.ts`; 5px drag threshold for tap vs drag.

**Implications:** Map edits go through reorganize, not local-only state.

---

## Mark presentation: diamond on ray, detail in hover card

**What changed:** Lateral `branchMarkScreenPosition`; labels in `MarkHoverCard`, not on SVG line.

**Rationale:** Legibility on dense branches; marks share sequence rank with pursuits.

**Tradeoffs:** Discoverability relies on hover/diamond affordance.

**Implications:** Don’t put long mark titles on branch strokes.

---

## Locked taxonomy + hub catalog for AI

**What changed:** `hub-catalog.ts` with `aiRoutingNote`, belongs/does-not lists; theme extract uses catalog.

**Rationale:** Stream quality depends on routing boundaries between hubs.

**Tradeoffs:** Taxonomy edits require catalog + migration + sync trifecta.

**Implications:** Hub renames flow through `LEGACY_HUB_MIGRATIONS` and sync, not string edits in one file.

---

## Flags for layout grammars

**What changed:** `FLAGS` module for trunk, longitudinal, trunk visible, debug probes.

**Rationale:** Ship geometry experiments without branch-per-user DB flags.

**Tradeoffs:** Compile-time inlining—easy to forget restart; multiple truth paths in `tree-branch-geometry`.

**Implications:** Test both flag states when touching layout; document env vars in `.env.example`.
