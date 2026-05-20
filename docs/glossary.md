# Glossary (AI-oriented, compressed)

Terms that materially affect reasoning. User-facing vocabulary; code symbols in parentheses where different. Full tables: repo root `GLOSSARY.md`, `ONTOLOGY.md`.

---

## Product hierarchy

| Term | Meaning |
|------|---------|
| **Theme** | Fixed life pillar (`finance`, `work`, `becoming`, `people`, `health`). Code: `LifeAreaId`, DB column `limbId`. |
| **Hub** | Named track under a theme; goals and timeline notes attach here. One root **`Branch`** row. |
| **Pursuit** | User word for **`Goal`** — transformational work with optional milestones. |
| **Timeline note** | Hub-scoped dated item; Prisma **`Mark`**. Not on pursuits. |
| **Milestone** | Phase **inside one goal** only; relational `Milestone` / `Subtask`. |
| **Stream** | Brain dump: extract → confirm → commit; entry **Tell me about this** on theme/hub panels. |

---

## Persistence vs display

| Term | Meaning |
|------|---------|
| **`Branch`** | DB row for a hub (`branchId` on Goal/Mark). Not the SVG stroke alone. |
| **`sequencedNodes`** | Runtime merge of goals + marks on a hub sorted by `sequencePosition` (and fallbacks). |
| **`sequencePosition`** | Fractional order along hub ray; reindex when gaps &lt; ε (`branch-sequence.ts`). |
| **`parentGoalId`** | Legacy **continuation** link; satellite layout, no sequence index. New pursuits via Stream, not Evolve. |
| **`archived`** | Soft hide on Goal/Mark; revive from hub archive section. |
| **`needsResolution`** | Stream ambiguous mark; user picks Done / In progress / Not started on map. |
| **`Mark.kind`** | `mark` (manual) vs `stream` (AI provenance). |
| **Bloom (persisted)** | `ACTIVE` \| `ON_HOLD` \| `COMPLETE` on `Goal.bloomStatus`. Legacy BUD/GROWING/BLOOMED/ENDED normalized at read. |
| **Lifecycle (derived)** | `computeGoalLifecycleBloom` from milestones — may override stale ACTIVE for display. |
| **Visual phase** | `deriveGoalNodeRenderState` → `ON_HOLD` \| `ACTIVE` \| `COMPLETE` for SVG halos/orbitals (not a DB enum). |

---

## Tree layout (render)

| Term | Meaning |
|------|---------|
| **Gateway** | Theme medallion point; `AreaAnchors.gateway`, `limbTip` in fork spec. |
| **Domain hub** | One of ~4 icons on spokes under a theme (Career, Family, …). In `tree-trunk-slots.ts`, “hub” means this—not gateway. |
| **Limb** | Major stroke trunk → gateway (`limbPieces`, `limbTip`). |
| **Spoke** | Visible gateway → domain hub line (`gatewaySpokeLengthPx`). |
| **Branch (visual)** | Data-layer child line in `AreaForkSpec.branches`; same geometry family as spoke. |
| **Domain-cluster** | Goals on 360° polar orbit around hub; conduit decorative. Default when longitudinal flag off. |
| **Longitudinal** | Nodes ranked along outward ray; branch lengthens on insert (`BRANCH_LONGITUDINAL_ALL`). |
| **Trunk layout** | Vertical trunk grammar; themes on alternating attach (`TREE_TRUNK_LAYOUT`). |
| **`isHubGatewayLayout`** | Topology flag: fork point at gateway (hub-and-spoke). |
| **Continuation child** | Goal with `parentGoalId`; `continuationChildScreenPosition` on hub ray. |
| **Canvas mark** | Amber diamond beside ray (`branchMarkScreenPosition`). |
| **Detail rail** | Left panel column: theme / hub / pursuit (`panelPresentation="rail"`). |
| **Mark hover card** | `MarkHoverCard` — primary mark detail on tree. |
| **Edit map** | Drag reorganize mode; `POST .../reorganize`; pan disabled. |

---

## Stream

| Term | Meaning |
|------|---------|
| **Extract** | `POST /api/stream/extract` — Gemini classifies pursuits, marks, ambiguous, status updates. |
| **Commit** | `POST /api/stream/commit` — writes accepted items with anchors. |
| **Confirmation queue** | Per-item cards; ambiguous excluded. |
| **`StreamSession`** | Theme-level prior dump storage for dedup across sessions. |
| **`aiRoutingNote`** | Hub catalog hint injected into extract prompts. |

---

## Assembly pipeline

| Term | Meaning |
|------|---------|
| **`mapToTreeData`** | Raw API branches/goals → `AreaData[]` for `TreeView`. |
| **`milestone-tree-projection`** | Relational milestones → hex orbital dots (max 6 by position). |
| **`milestoneDoneForSemantics`** | Single completion truth for bloom + projection. |
| **`normalizeGoalBloomForDisplay`** | Read-time bloom correction (stale ACTIVE, legacy enums). |
| **`syncHubTaxonomyForUser`** | Aligns user root branches to `LOCKED_HUB_TEMPLATES` (may delete/create/rename). |

---

## Flags (compile-time)

| Flag | Effect |
|------|--------|
| `TREE_TRUNK_LAYOUT` | Trunk vs radial theme-star (default on). |
| `TREE_TRUNK_VISIBLE` | Thick trunk silhouette. |
| `BRANCH_LONGITUDINAL_ALL` | Longitudinal vs domain-cluster goals (default off). |
| `FOCUS_MODE` | Dim non-focused theme via icon toggle. |
| `GOAL_MILESTONES` | Hex orbitals + related goal layout gate. |

Env: `NEXT_PUBLIC_*`; restart dev server after change.

---

## Forbidden / deprecated (new work)

| Avoid | Use instead |
|-------|-------------|
| `thread*` domain IDs | `hub`, `branchId`, `DomainHubData` |
| User “fork” for evolution | Stream; qualify **layout fork** |
| `BRANCHED` on goal bloom | ACTIVE + milestone rules |
| Pursuit-scoped marks | Hub mark or goal description/milestones |
| `treeMilestones` JSON | Relational milestones |

---

## Collision warnings

| Term | Ambiguity |
|------|-----------|
| **Fork** | SVG layout vs removed goal-fork API vs legacy branch split row. |
| **Branch** | Prisma model vs visual stroke vs English “branch line.” |
| **Hub** | User track vs domain hub icon vs gateway. |
| **Mark** | Prisma model vs verb “mark done” vs canvas diamond. |
| **Moment** | Legacy `goalType` or old product word → **timeline note** / `Mark`. |
