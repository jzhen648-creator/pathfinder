# Decisions

Short-lived engineering decisions and behavior notes. Prefer dates + one paragraph each.

## Product Positioning

Pathfinder + AI companion positioning:

- Pathfinder is the end-to-end checkpoint tracker — start to finish of any pursuit
- Claude/ChatGPT is the thinking and planning layer
- Stream is the bridge between AI conversation and the life map
- This positioning should be visible in the app:

  Onboarding: one sentence explaining AI companion role
  "Pathfinder works best alongside Claude or ChatGPT.
  Use AI to think and plan — bring what matters here to track your journey."

  Stream empty state copy:
  "Had a conversation with Claude or ChatGPT?
  Paste it here — Pathfinder will extract what matters and add it to your map."

  Now tab when map is sparse:
  "Talk through your goals with Claude or ChatGPT,
  then bring the outcomes here via Stream."

  App Store description must include:
  "Works alongside Claude, ChatGPT, and other AI.
  Use AI to plan. Use Pathfinder to remember."

  Tagline candidate:
  "AI conversations end. Your map doesn't."

Do not build any of this copy into the app yet. Document only. Implementation happens in Session 14 (Onboarding) and as part of Stream empty state polish.

## Backlog / Future Ideas

### Future: Cinematic Intro Video

**What:** A 30–60 second AI-generated video for use as App Store preview, onboarding splash, and marketing asset (website hero, social).

**Purpose:** Emotional priming before the user touches the product. Not a feature walkthrough — a feeling. The problem (insights disappearing, life unrecorded) → the turn (a path appears) → the map comes alive → "Start talking."

**Visual language:** Dark background, thin strokes, warm cream nodes. Pathfinder aesthetic translated into cinematic style.

**Tools to explore:** Sora, Kling, Runway.

**Status:** Not started. Do not build until core product is stable and in users' hands.

## 2026-05-25 — Revised session roadmap (Sessions 9–16)

This supersedes prior session numbering and placement in older dated entries below (notably the 2026-05-24 Session 10 onboarding entry and the original 2026-05-25 Stream V3 / Profile Memory Phase B entries). When numbering conflicts, this section wins.

### Session 9 — Profile Memory Phase A — COMPLETE

Manual profile fields (name, DOB, location, languages, occupation) added to the schema as `UserManualProfile`. Shared AI context utilities `formatUserContext` and `formatMapContext` extract and weight profile data for prompts. Stream extraction and milestone suggestion endpoints now receive profile context with correct weighting. Mobile profile screen exists and works on iPhone.

### Session 10 — Milestone Suggestion Fixes — DONE (confirmed on device)

Short, prompt-only session. Targeted fixes to both endpoints:

- [`src/app/api/goals/suggest-milestones/route.ts`](src/app/api/goals/suggest-milestones/route.ts)
- [`src/app/api/goals/[goalId]/suggest-milestones/route.ts`](src/app/api/goals/[goalId]/suggest-milestones/route.ts)

**Problem:** current suggestions feel like tasks (things to do), not milestones (waypoints that mark meaningful progress).

- Tasks = inputs (things you do, you control). They create stress and mean nothing when checked off. Examples: "Write targeted cover letters", "Research 5 mortgage broker firms", "Apply to 10 job openings".
- Milestones = outcomes (things that change, reality confirms them). They tell a story and mark real progress. Examples: "CV updated and ready", "First application submitted", "Interview secured", "Offer received", "First day completed".

**Updated prompt rules:**

- Milestones are meaningful waypoints on a journey.
- Phrased as achievements, not actions. Each one marks a real change in status.
- 3–5 maximum, ordered as a story arc — chapters of the journey, not sentences.
- Profile context is subtle calibration only; never drives milestone content.
- Profile should remove irrelevant suggestions, not add location/demographic assumptions to every milestone.
- GOOD framing: "X achieved", "X secured", "X completed", "X done", "X ready".
- BAD framing: "Do X", "Complete X task", "Research X", "Apply to X number of things".

### Session 11 — Now Tab + Insights Architecture — DONE (confirmed on device)

Significant build. Replaces the Tasks tab entirely.

**Core concept:** Tasks tab becomes "Now" — a guidance surface, not a checklist. Three app surfaces after this session:

- **Map** → where am I (spatial, exploratory).
- **Stream** → what happened (capture, input).
- **Now** → what matters (guidance, reflection).

**Now tab design:** Not a to-do list. A daily compass reading. Shows momentum, neglect signals, one focus, encouraging context. Feels like a wise friend who knows your situation. Never creates stress or obligation. No checkboxes on this surface.

Example Now tab content:

> Good morning Jeremy.
>
> MOMENTUM
> Active across 4 themes this month. That puts you in rare company.
>
> WORTH YOUR ATTENTION
> Your mortgage broking transition has been quiet for 2 weeks. Waiting phases are the hardest part of career transitions.
>
> SOMETHING INTERESTING
> Your ISA target puts you in the top 5% of contributors for your age group.
>
> Open Stream to capture anything from today.

**Insight levels — all from one API call:**

- Global → Now tab content.
- Theme → sparkle button on theme detail sheet.
- Hub → sparkle button on hub detail sheet.
- Pursuit → sparkle button on pursuit detail sheet.

**Single generation architecture:** One Gemini call generates ALL levels at once. Returns structured JSON:

```json
{
  "global": "full life guidance text",
  "themes": {
    "finance": "money & finance insight",
    "work": "work & career insight",
    "becoming": "who im becoming insight",
    "people": "people & relationships insight",
    "health": "health & body insight"
  },
  "hubs": { "[hubId]": "hub specific insight" },
  "pursuits": { "[pursuitId]": "pursuit specific insight" }
}
```

All 17 hubs and all active pursuits are included.

**Cache strategy:** stored in `InsightCache` (see the dated "InsightCache table design" entry below). Regenerate only when the user explicitly taps Refresh on the Now tab, on first open with no cache, or once per day automatically. Never auto-regenerate on every page load.

**Insight structure per level:**

```json
{
  "reflective": "what your map data shows",
  "contextual": "what the world knows about this",
  "combined": "what both mean for you specifically",
  "tone": "encouraging | nudge | celebratory",
  "oneLiner": "single most useful thing to know"
}
```

- **Reflective layer (your data):** purely map data and profile — what pursuits exist, milestone progress, activity patterns, theme balance, time since last activity per hub.
- **Contextual layer (world knowledge):** real statistics and benchmarks. Population data, research, averages. Age-appropriate comparisons. Geographic context from profile location.
- **Combined layer (the magic):** what your specific data means in world context. E.g. "You're at the hardest point statistically. Most people drop off here. You haven't." — only possible with both layers together.

**ACCURACY RULES — critical, never violate:**

1. Never fabricate statistics or percentages.
2. Use the nearest meaningful real benchmark. E.g. £18k ISA target → compare to the £20k allowance and UK average contributions, NOT "78% of people contribute £18k".
3. Always use approximate language: "around", "roughly", "approximately", "about". NEVER: "exactly 73.4% of people".
4. Geographic context from profile location: UK benchmarks for UK-specific pursuits (ISA), Singapore context for Singapore pursuits (CPF), universal context for health/personal pursuits.
5. Age context always applied: "At 29…" or "For someone in their late 20s…".
6. When uncertain → omit entirely, never guess. "This is ambitious for your age group" is better than an invented percentage.
7. Ultimate accuracy test before including any statistic: "Would this survive a Google search?" If no → remove it.
8. Cite general source when appropriate: "Based on HMRC ISA statistics…", "UK median salary data suggests…". Builds trust for financial insights.

**Encouraging tone through honest context:** real benchmarks are more powerful than fake ones. "Only 7% of ISA holders max their allowance. You're targeting 90% of the maximum at 29. That's genuinely uncommon." — honest, accurate, and more encouraging than any invented statistic.

### Session 12 — Stream V3 — PLANNED

Major build. Natural-language interface for the entire life map. **Built before Marks on Mobile (Session 13)** because Sessions 7–8 inline contextual composers become wasted effort if V3 replaces them; building V3 now simplifies the codebase and fulfils the core product philosophy completely.

**Core concept:** Stream becomes a complete natural-language interface for the entire life map. Not just create — everything. "Just talk" becomes literally true.

- **Current Stream (V1):** creates pursuits, marks, milestones only. Requires theme picker. Multiple entry points (FAB, hub, pursuit).
- **Stream V3:** handles CREATE, UPDATE, DELETE, COMPLETE, MOVE, REORDER, HOLD, CONTINUE. One entry point — FAB only. No theme picker — AI infers everything. Inline contextual composers deprecated.

**Card types.** Existing (keep): `PURSUIT`, `MARK`, `MILESTONE`, `EMBELLISHMENT`. New (add): `UPDATE_PURSUIT` (rename or redescribe), `UPDATE_MILESTONE` (rename existing milestone), `COMPLETE_MILESTONE` (mark done with date), `COMPLETE_PURSUIT` (mark pursuit as complete), `HOLD_PURSUIT` (put pursuit on hold), `MOVE_PURSUIT` (change hub placement), `DELETE_MILESTONE` (remove milestone), `REORDER_MILESTONES` (change order), `CONTINUATION` (pursuit evolves from another).

**Intent detection in extraction prompt:**

> Determine if user intent is: CREATE (new item), UPDATE (change existing), DELETE (remove), COMPLETE (mark done), MOVE (change placement), HOLD (pause).
>
> Match UPDATE/DELETE/COMPLETE to existing map items by title similarity and context. If ambiguous → return CLARIFY card: "Did you mean [pursuit name]? [Yes] [No, pick one]". Confirmation step protects against all mistakes. Nothing executes without user confirmation.

**Removed after V3:** theme picker screen, hub inline composer, pursuit inline composer, multiple Stream entry points, pre-targeting logic.

**Stays:** confirmation card flow (same pattern), one card at a time, nothing saves until confirmed, map updates after commit, FAB button (now the only entry point).

**Works as a Claude/ChatGPT companion:** user has a deep conversation with Claude, copies key insights and action items, pastes into Pathfinder Stream V3, and the map updates automatically — new pursuits created, existing ones updated, milestones added from advice, status changes applied. One paste, map fully synchronised.

### Session 13 — Marks on Mobile — BUILT (device sign-off pending)

Show marks as checkpoints on the map path. Mark detail as a bottom sheet. Marks visible in hub and pursuit detail. Mark creation via Stream already works — this session makes them visible on the map. Marks are permanent and immutable; reframe adds perspective without editing the original.

**Mobile shipped:** amber diamond nodes along hub branch connectors on `MapCanvas` (up to 8 per hub, chronological); `/mark/[id]` bottom sheet (title, date, description, hub link, immutability note, related marks); hub “Marks on this hub” list; pursuit “Marks on this hub” section when the branch has marks.

### Session 14 — Onboarding — PLANNED

Simplified significantly by Stream V3 — Stream V3 IS the onboarding mechanism.

**Flow:**

- **Screen 1:** "Welcome to Pathfinder".
- **Screen 2:** single voice/text prompt — "Tell me a little about yourself and what you're working on right now." User speaks naturally for 30–60 seconds. Stream V3 extracts profile facts → `UserManualProfile`, pursuits → map, milestones → pursuits.
- **Screen 3:** "Your map is ready" → land on map with real data already populated.

No guided multi-step flow needed; Stream V3 handles everything naturally. Store `onboardingCompleted` flag after first commit.

### Session 15 — Profile Memory Phase B — PLANNED

`UserMemory` uses one structured prose `blob` field for V1, not separate `coreBlob` / `extendedBlob` fields. The blob has internal sections such as "Who I am", "How I operate", and "What I'm oriented toward". Strict separation: blob = WHO, map = WHAT. Never reference pursuits, marks, milestones, projects, or specific named work items in the blob; extract only identity-level patterns. Evolution mechanism with session calibration. `UserMemoryHistory` retains the last 5 versions. `lastUserEditedAt` protects manual edits from being silently overwritten by background extraction. Extraction runs after Stream commit (background). User can read and edit the blob directly. Displayed as flowing text on the profile screen, below the manual profile fields.

**Sequenced after Onboarding** because onboarding seeds initial Stream data, blob extraction needs Stream sessions to work from, and Phase B is most valuable with rich data.

### Session 16 — Map Visual Polish — PLANNED

Only after Marks are on the map (Session 13) so the full visual vocabulary exists before polishing.

**Polish targets:**

- Path character and texture.
- Theme nodes as landmarks (larger, glowing).
- Hub nodes with depth.
- Mark checkpoints as distinct diamonds.
- Pursuit dots with personality.
- Background atmosphere (not pure black).
- Smooth camera animation between nodes.
- Node pulse for active/recent pursuits.
- Path draws itself on first load.

Reference: desktop tree visual language translated into the mobile winding path.

## 2026-05-25 — Monetisation model

**Model:** Freemium + 14-day free trial. No credit card required to start the trial. Day 10: gentle in-app reminder. Day 14: trial ends.

**Pricing after trial:**

- £6.99 / month
- £49.99 / year (~£4.17/mo, save 40%)
- Push annual — better for revenue predictability.

**Free tier (after trial):** map browsing read-only, Stream disabled, "Your map is here when you're ready to continue". Soft gate — not hard lock. User can still see what they built.

**Pro tier (subscribed):** full Stream access, AI milestone suggestions, Profile Memory, Now tab + Insights, voice input, unlimited everything.

**Payment:** Apple In-App Purchase only via RevenueCat. Apple takes 30% year 1, 15% after. RevenueCat is free up to $2,500/month revenue.

**Privacy positioning:** "We charge for the app so we never need to sell your data." Front and centre in the App Store description.

## 2026-05-25 — Stream cross-theme extraction rule

Stream extracts ALL items from any input regardless of which level it was opened from. Hub/pursuit pre-targeting is a placement hint only; cross-theme items are still extracted and placed correctly. Nothing is lost because Stream was opened from a specific context.

**After Stream V3 (Session 12):** the FAB becomes the only Stream entry point, inline contextual composers are deprecated, pre-targeting is removed entirely, and AI infers placement from content + map context.

## 2026-05-25 — InsightCache table design

Supports the Session 11 Now tab + Insights architecture.

**Schema (`InsightCache`):**

- `userId` (unique)
- `globalInsight` (text)
- `themeInsights` (JSON)
- `hubInsights` (JSON)
- `pursuitInsights` (JSON)
- `generatedAt` (DateTime)
- `mapVersion` (hash of pursuit/milestone/mark counts + latest `updatedAt`)
- `memoryVersion` (Int — from `UserMemory.version`)

**Cache is invalid when:** `mapVersion` changes (new data added to map) or `memoryVersion` changes (profile blob updated).

**User never manages cache manually.** Refresh button on the Now tab triggers regeneration. Auto-regeneration is capped at once per day.

## 2026-05-23 — Global Stream / Bark deferred

Global "say anything" Stream that routes across all themes and hubs is deferred until theme Stream is stable. Near-term fix: theme Stream should flag out-of-theme items as ambiguous rather than losing them silently. Architecture should support per-item `themeId` + `hubId` so global Stream can be added later without a rebuild.

## 2026-05-23 — Profile Memory layer planned

Stream dumps contain three layers: map actions (pursuits, marks), which are captured today; context for existing items, which is partially captured; and profile insight (patterns, stressors, values, preferences), which is not captured today. After Stream is stable, add a Profile Memory extraction lane to the `StreamSession.summaryJson` scaffold. Extract small reviewable insights like "work stress often comes from unclear expectations" or "financial planning is tied to feeling safe." These are private, editable, and used to improve future Stream routing and personalisation — not shown as tree nodes.

## 2026-05-24 — Session 10 onboarding redesign

_Superseded by the 2026-05-25 revised session roadmap above: onboarding is now **Session 14**, and is further simplified because Stream V3 (Session 12) becomes the extraction mechanism._

Session 10 onboarding is **one single Stream-style voice moment**, not a multi-screen interview or goal-setting flow. Screen 1: "Welcome to Pathfinder" with subtitle "One quick question before we build your map." and a single "Let's go" action. Screen 2: one calm prompt only — "How old are you, where are you based, and what do you do?" — with the microphone as the primary centered action, live transcription below, a secondary keyboard fallback, and Continue available after speaking. Screen 3: brief "Setting up your map..." processing. AI extracts only Profile Memory facts from the answer: age and location as `personal`, current role/work as `career`. It creates **no pursuits, marks, milestones, branches, or map nodes**. Screen 4: map ready state: "Your map is ready. Tap + to start." with the Stream FAB gently pulsing.

Onboarding must not ask about goals, pursuits, health, relationships, personal growth, future self, or anything that needs more than roughly ten seconds of thought. Those emerge naturally through Stream over time. Voice is primary; skipping is allowed and still stores onboarding as completed. The answer feeds the same Session 9 `ProfileFact` system and extraction pipeline — no separate onboarding profile store.

## 2026-05-25 — Profile Memory Phase B planned

_Superseded by the 2026-05-25 revised session roadmap above: Phase B is now **Session 15**, scheduled after Onboarding (Session 14) so the blob has Stream history to extract from._

Future Profile Memory Phase B adds a `UserMemory` model with a single structured prose `blob`, `isDirty`, `streamSessionCount`, `version`, and `lastUserEditedAt`, plus `UserMemoryHistory` retaining the last five versions. Do not add `coreBlob` or `extendedBlob` for V1. Extraction runs after Stream commits in the background and evolves the blob with session calibration. Strict separation remains: the blob is **WHO** context, while pursuits, milestones, and marks are **WHAT** map data. The blob must never reference pursuits, marks, milestones, projects, or specific named work items, and users can read and edit it directly as flowing text on the profile screen.

## Cleanup needed (future migration)

Remove `ProfileFact` model, `StreamSession.processedForProfile` column, and old `/api/profile/classify` and `/api/profile/facts` routes. These were superseded by `UserManualProfile` in Session 9 Phase A.

## 2026-05-25 — Stream V3 planned

_Superseded by the 2026-05-25 revised session roadmap above: Stream V3 is now **Session 12**, scheduled **before** Marks (Session 13), with the full expanded card-type list and intent-detection rules in the roadmap entry._

Future Stream V3 is the complete natural-language interface for map changes: create, update, delete, complete, pause, move, and continue existing items. New confirmation card types include `UPDATE_PURSUIT`, `UPDATE_MILESTONE`, `COMPLETE_MILESTONE`, `HOLD_PURSUIT`, `MOVE_PURSUIT`, `DELETE_MILESTONE`, and `CONTINUATION`. V3 replaces inline contextual composers with one FAB entry point, resolves references to existing map items, uses clarifying cards for ambiguous references, and keeps confirmation as the safety layer. It should work as a companion to Claude/ChatGPT, where a user can paste an AI conversation and have the map update. Build after Marks (Session 11), when the map has enough rich data to need editing.

## 2026-05-22 — Stream extract context budget + session summary scaffold

Stream extract prompts are bounded before model calls: active and archived hub rows use the same caps (`10` pursuits / `20` marks), previous theme session dumps are truncated to three 500-character snippets, and extract/commit input text shares an 8,000-character limit. Theme Stream still routes by catalog inference first; if inference finds no hub matches, context falls back to the two most recently updated theme hubs via `Branch.updatedAt` instead of sending every hub in the theme. V2 session summarisation is scaffolded only: `StreamSession.summaryJson` can later store a structured `StreamSessionSummary` (`intent`, `hubSlugs`, `pursuitTitlesReferenced`, `summary`) from a fail-soft post-commit summarisation step near `recordStreamThemeSession`.

## 2026-05-19 — Tree / Stream product sprint (panels, marks, edit map)

**Product brief:** [`BRIEF.md`](./BRIEF.md) — current onboarding summary. **Ship log:** [`CHANGELOG.md`](./CHANGELOG.md) (2026-05-19).

### Evolve removed; Stream replaces goal evolution UX

**Evolve** (propose → revise → commit via `fork/propose` + `fork`) is removed. **Stream** is the supported path for new pursuits, timeline notes, and milestones. **Kept:** `Goal.parentGoalId` + `continuationChildScreenPosition` for existing data/layout. **Removed:** `evolve-goal-proposal.ts`, fork APIs, panel **Evolve this pursuit**.

### Panels and tree chrome

- **Theme / hub / pursuit** detail uses a left **rail** (`panelPresentation="rail"`). Timeline notes do **not** use `TreePanel` — they use **`MarkHoverCard`** (hover + pin) on the map.
- **Theme panel:** scannable hub list, **Open Stream** (theme Stream). **Hub panel:** catalog sections, marks list, pursuits (active first), **Open Stream**, archive revive. **Pursuit panel:** **Active / On hold / Complete** (`PATCH` `bloomStatus`), **Open Stream**; no add-mark from pursuit.
- **Marks are hub-level only** — never attached to a pursuit row; Stream prompts forbid `pursuitRef` on marks. Milestones remain on pursuits (hex orbitals).

### Ambiguous Stream items on the tree

Extract may return `ambiguous[]`. On commit they become **`Mark`** rows with `needsResolution: true` (not confirmation cards). User resolves on the tree hover card or `POST /api/stream/resolve-ambiguous` → maps to mark sentiment / pursuit bloom. Hub panel shows unresolved count.

### Edit map (drag-and-drop)

Toolbar **Edit map** (`editMapMode` in `tree-view.tsx` → `TreeSVG`). Disabled during active Stream. **`POST /api/goals/[goalId]/reorganize`:** `moveToHub` (same theme only, cascades `branchId`/`limbId` to descendants) or `reparent` (max children = `TREE_GOAL_MAX_CHILDREN_PER_NODE`, cycle check). Branch reorder via `sequenceAnchor` on `moveToHub`. Pan off while editing; 5px threshold preserves tap-to-open pursuit. After ≥1 move, next Stream open pre-fills an acknowledgement draft.

### Soft delete

`Goal.archived` / `Mark.archived` — hidden from tree load; revive from hub archive section. DELETE on marks archives.

### Map hit targets (May 2026)

Removed clicks on **limb hull polygons**, **wide limb-stem** transparent strokes, and **hub branch-line labels**. Theme navigation: **gateway medallion + theme label row**; hub: domain-hub hit rect; focus mode (flag): **theme icon** only — not backdrop geometry.

### Mark canvas placement

Marks share `sequencedNodes` order with pursuits but render **beside** the branch ray (`branchMarkScreenPosition`, amber diamond). Labels live in hover card / panel copy, not on the SVG line.

## 2026-05-16 — Branch-line sequence position + insert-and-reflow grammar

Replaces the fixed-orbit **domain-cluster** layout with a **sequence-driven longitudinal** grammar for all themes, gated behind `FLAGS.BRANCH_LONGITUDINAL_ALL` (env `NEXT_PUBLIC_BRANCH_LONGITUDINAL_ALL=1`). Default **off** while in active development — flip on locally to eyeball.

**Why switch back to longitudinal:** domain-cluster places goals at polar angles `(2π × goalIndex) / nGoals` around a fixed-radius hub. By construction, adding a node *rotates* every existing node and never lengthens the branch. That fundamentally blocks the "branch grows; existing nodes don't move" reflow contract.

**Data model:**
- `Goal.sequencePosition Float?` + `Mark.sequencePosition Float?` + `Mark.kind String @default("mark")` (provenance `mark` / `stream` for AI Stream). Composite index `(branchId, sequencePosition)` on both tables. Migration `20260516040000_add_node_sequence_position_and_mark_kind`.
- No new `Moment` table — `Mark` already belongs to a hub via `branchId`, is archive-only, and is canonically named "timeline note" in `GLOSSARY.md`.
- Continuation children (`Goal.parentGoalId != null`) **are excluded** from the sequence — they keep parent-anchored satellite layout via `continuationChildScreenPosition` (unchanged).
- Backfill: `npm run backfill:node-sequence` — merges goals + marks per branch and assigns `sequencePosition = 100, 200, 300, …` in `(year, month, createdAt)` order. Idempotent (skips rows that already have a position; pass `--force` to overwrite).

**Geometry (when flag on):**
- Each node occupies one rank slot of `BRANCH_NODE_SPACING_PX = 84` along the outward direction from the hub anchor. Rank is the index in `DomainHubData.sequencedNodes`.
- `nodePosition(rank) = hub + outwardDir × (BRANCH_HEAD_OFFSET_PX + rank × BRANCH_NODE_SPACING_PX)`
- `branchTipDistance(rankMax) = BRANCH_HEAD_OFFSET_PX + rankMax × BRANCH_NODE_SPACING_PX + BRANCH_TIP_PADDING_PX`
- Outward direction is derived from the existing authored stroke's terminal tangent (`branchOutwardUnitFromCatalog`), so authored gateway angles in `AREA_ANCHORS` are preserved — no anchor re-authoring required.
- Uniform spacing across kinds. Goals = hex medallion (~12 px), moments = dot (~4.5 px). Spacing is identical so `rank = absolute position`.
- No logical cap on node count. Branches grow as needed; busy hubs naturally look busier. Viewport fit (`tree-view-fit.ts`) samples the dynamic tip via `branchTipPointForNodeCount`.

**Insertion API:**
- Shared resolver `src/lib/branch-sequence.ts`: `append` / `after` / `before` / `between`. Midpoint fractional indexing; reindex the whole branch when min gap < `1e-3`. Reindex runs inside the same `prisma.$transaction` as the inserted row.
- Wired into `POST /api/goals` and `POST /api/marks` (optional `anchor` body field).
- New `POST /api/branches/[branchId]/nodes` is the kind-tagged unified entry point (AI Stream).
- New `PATCH /api/branches/[branchId]/reorder` for explicit batch reorder; edit-map also uses `sequenceAnchor` via `POST /api/goals/[goalId]/reorganize`.

**Out of scope (separately scoped follow-up):** retirement of `Goal.goalType: moment|event` rows and `/api/moments/[id]`. The transitional union in `tree-data.ts` keeps the visual correct in both row flavors meanwhile. Cleanup of the domain-cluster code paths (`goalScreenPositionDomainCluster`, `domainClusterHubAnchorFromCatalog`, `DOMAIN_CLUSTER_*` constants, `LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS`) follows visual sign-off.

**Known visual risk (flagged):** neighbouring hubs on the same theme radiate at fixed angles from the theme gateway. At very high counts (>~30 nodes on one hub while a neighbour is sparse) the long branch can visually encroach on the neighbour's wedge. Acceptable for v1; a follow-up sprint can introduce per-theme angle redistribution or LOD clustering.

## 2026-05-16 — AI Stream (extract + confirmation commit)

Implements the product concept in **Stream** below. Per-hub overlay: user dumps text/voice → **`POST /api/stream/extract`** classifies items (pursuits, timeline notes, ambiguous) with hub/branch context and optional prior-session summary → **`StreamConfirmation`** card queue → **`POST /api/stream/commit`** writes accepted rows (goals/marks with `anchor` / sequence when longitudinal flag is on). `Mark.kind = stream` records provenance. Requires `GEMINI_API_KEY`. Unified insertion can also use **`POST /api/branches/[branchId]/nodes`**. See [`CHANGELOG.md`](./CHANGELOG.md) (2026-05-16).

## 2026-05-16 — Progressive hub reveal (`isActive` / `isSystemHub`)

New profiles get **17** system hubs from `LOCKED_HUB_TEMPLATES` (`system-hubs.ts`) with `isSystemHub = true`, `isActive = false`. Onboarding (or **`POST /api/branches/activate`**) sets `isActive` for user-chosen themes. Tree data and APIs filter to active roots so the map grows with the user. Hubs that already had goals/marks are backfilled active in migration `20260517100000_add_branch_hub_visibility`. System hubs are protected from wipe scripts.

## 2026-05-15 — Tree Layout Terminology (render-only glossary)

Canonical names for the trunk-layout render code. Captured here so future readers do not have to re-derive the convention from in-file comments. No code rename; this section documents existing usage.

| Term | Meaning | Where it lives |
|------|---------|----------------|
| **gateway** | The big themed medallion point (Work, People, etc.). Coordinate, not SVG element. | `AreaAnchors.gateway`, `computeThemeGateway*`, local `themeGatewayPt` |
| **limbTip** | Struct alias for the gateway point *inside* an `AreaForkSpec`. In hub-and-spoke topology the limb terminates at the gateway, so the names coincide by design. | `AreaForkSpec.limbTip` in `tree-forks.ts` |
| **trunkAttach** | Point on the trunk surface where a limb emerges. In legacy radial layout this field is "synthetic" — set equal to the gateway as a degenerate stem. Discriminated by `isHubGatewayLayout`. | `computeTrunkAttachForTheme`, `AreaForkSpec.trunkAttach` |
| **hub** (inside `tree-trunk-slots.ts`) | **Domain hub** — one of the four sub-icons per theme (Career under Work, Income under Money, etc.). | `hubFan*`, `hubOrbitRadius`, `hubBranchAngleRadForTrunkTheme`, `domainHubLabelLayout`, `TREE_TRUNK_DOMAIN_HUB_RING_PX` |
| **limb** | The major stroke from trunk to gateway. | `limbPieces`, `limbStrokeWidth`, `limbOffsetX`, `limbRiseY`, `limbTip` |
| **branch** | Data-layer child of a life area (one entry in `AreaForkSpec.branches`). At the data layer the same geometric line that the visual layer calls a *spoke*. | `AreaForkSpec.branches[]`, `BranchForkSpec`, `branchPieces` |
| **spoke** | The visible gateway-to-domain-hub line. Length controlled by `gatewaySpokeLengthPx`. Same line as `branchPieces` at the data layer. | `gatewaySpokeLengthPx`, `data-tree-domain-gateway-spoke`, `hubSpokeLength` slot field |
| **fan** | The angular spread of the four domain hubs around the gateway. | `FanSpec`, `buildHubFanSpecForTheme`, `domainHubFanAngleRad`, `TRUNK_HUB_FAN_*`, slot fields `hubFanHalfSpanDeg`, `hubFanCenterOffsetRad` |
| **`isHubGatewayLayout`** | Topology discriminator: all branches share a fork point at the gateway (hub-and-spoke). True under trunk layout. Names a topology, not a node. | `tree-forks.ts` |

**Rules of thumb when adding new code:**

1. Inside `tree-trunk-slots.ts`, the word "hub" alone means **domain hub**. The gateway is never called "hub" in this file.
2. New per-limb fields on `TrunkThemeSlotSpec` follow the prefix convention: `limb*` for trunk-to-gateway, `hub*` for domain-hub things, `gateway*` only for the medallion point itself.
3. `limbTip` and `trunkAttach` are *aliases* inside `AreaForkSpec` that work in both legacy and trunk layouts. Do not rename — `isHubGatewayLayout` is the discriminator.
4. Layout-edit `hubPositions` are keyed by **branch id** (`DomainHubData.id`), not array index or stem-sort slot (`kFork`). Saving by index broke drags because render looks up by `kFork = sortedBranchIdx.indexOf(idx)`.

## 2026-05-14 — Locked theme & hub taxonomy (data-layer)

**Version:** `2026-05-14-v3` (`src/lib/taxonomy.ts`) — **finance hub display names superseded 2026-05-16** (see end of file); five themes, four hubs each (20 root branches for new profiles).

This is a **data-layer** change — separate from the trunk **visual** layout sprint (see next section).

| Theme | `LifeAreaId` | Hubs |
|-------|--------------|------|
| Money & Finance | `finance` | Income, Assets, Safety net, Liabilities |
| Work & Learning | `work` | Career, Skills, Projects, Network |
| Who I'm Becoming | `becoming` | Purpose, Reflection, Habits, Joy |
| People & Relationships | `people` | Family, Romance, Friendships, Community |
| Body & Energy | `health` | Movement, Recovery, Nutrition, Upgrades |

**Rules of thumb**

- **Body & Energy** — movement, recovery, fuel, and body projects you choose (teeth, hair, skin).
- **Who I'm Becoming** — orientation, inner life, identity rituals, and joy you protect (hobbies, culture, experiences).
- **Money & Finance** — earn → grow → protect → owe. Charitable giving: **Purpose** (values) or **Community** (causes/service).
- **Pleasures** removed as a sixth theme; legacy `pleasures` limb rows migrate to `becoming` / **Joy**.

**Renames from 2026-05-10 baseline:** Protection → Safety net; Giving → Liabilities (was Debt & obligations); Investing → Assets (was Investments); Meaning + Spirituality → Purpose; Inner work → Reflection; Mind/Energy → Upgrades; Sleep/Rest/Downtime → Recovery; Play/Hobbies/Culture/Experiences → Joy.

Legacy hub labels are aliased in `taxonomy.ts` / `hub-catalog.ts` and migrated in `hub-taxonomy-sync.ts`.

**Sync behavior (intentional, not trunk layout):**

- `syncHubTaxonomyForUser` in `src/lib/hub-taxonomy-sync.ts` **creates, updates, and deletes** root `Branch` rows so each user matches the canonical template (label renames, Pleasures migration, dedupe, pad missing slots).
- Invoked on **`GET /api/branches`** — **mutates data on read**. Documented in-route; future sprint may move sync to login/onboarding or a dedicated endpoint.
- Tree assembly (`mapToTreeData`) uses template order and canonical labels at read time — presentation order, not stored SVG coordinates.

## 2026-05-14 — Trunk-relative tree layout (render-only)

**Status:** **Live**, default **on**. `FLAGS.TREE_TRUNK_LAYOUT` is **on** unless `NEXT_PUBLIC_TREE_TRUNK_LAYOUT=0` or `false` in env (e.g. `.env.local` restores radial theme-star instantly).

Product direction: replace the radial **theme-star** hub placement (`computeThemeGateway` in `tree-area-anchors.ts`) with a **trunk grammar** — central vertical axis, crown slot for Who I'm Becoming, four main themes on alternating left/right attach points, major branch lines trunk → gateway, downstream domain-cluster geometry unchanged.

**Scope — render-only (no data-layer changes in this sprint):**

- Slot table and attach math: `src/components/tree/tree-trunk-slots.ts`
- Fork / branch geometry when flag on: `tree-forks.ts`, `tree-branch-geometry.ts`
- SVG centerline and optional vascular trunk mass: `tree-svg.tsx`, `tree-trunk-geometry.ts`
- Fit-to-view sampling: `tree-view-fit.ts`
- **No Prisma writes**, **no API changes**, **no stored hub coordinates** — positions are derived from layout constants at render time.
- Gated by **`FLAGS.TREE_TRUNK_LAYOUT`** only (env var / compile-time flag; **no per-user DB backing**).
- **`FLAGS.TREE_TRUNK_VISIBLE`** (default off) controls the thick trunk silhouette separately from layout.

**Not in scope here:** taxonomy v3 (`hub-taxonomy-sync.ts`, catalog renames, `GET /api/branches` mutation) — see previous section.

**Stabilization:** Camera fit-to-view shipped separately (phase 1). Trunk layout work is explicitly **post-freeze** layout migration.

## 2026-05-12 — Theme & hub vocabulary

User-facing and canonical-doc vocabulary is **theme** (outer pillar) and **hub** (track under a theme; goals/marks attach there). **Timeline note** is preferred over **mark** in UI; the Prisma model remains `Mark`. **Goal evolution** is legacy data only (`parentGoalId`); new pursuits via **Stream** (Evolve removed May 2026). **New hub splits from timeline moments** are **removed** — `POST /api/branches` only creates **root** hubs. TypeScript/Prisma identifiers (`LifeAreaId`, `limbId`, `Branch`) unchanged — see [`GLOSSARY.md`](./GLOSSARY.md).

For a **file- and route-level** list of what landed in the repo (migrations, deleted modules, new APIs, dev tooling), see [`CHANGELOG.md`](./CHANGELOG.md) — especially the dated section for **2026-05-10**.

## 2026-05-10 — Tree Focus Mode

**Updated May 2026:** Focus is toggled from the **theme icon / gateway label row** only — not limb hull polygons, stem hit strokes, or hub branch-line labels (those no longer capture clicks). Other limbs fade when `focusedLimbId` is set. Driven by `tree-view.tsx`, gated by `FLAGS.FOCUS_MODE`. Pursuit and timeline-note nodes keep their own click/hover behaviour.

## 2026-05-16 — Tree polish (ambient goals, milestone density, finance hub labels)

**Taxonomy:** `TAXONOMY_VERSION` is now `2026-05-16-v4` in `src/lib/taxonomy.ts`. Money & Finance default hubs read **Income, Assets, Safety net, Liabilities** (replacing *Investments* and *Debt & obligations* on new templates and in catalog copy). Older rows and seeds still keyed by legacy strings are normalized through `HUB_LABEL_ALIASES`, `LEGACY_HUB_MIGRATIONS`, and `syncHubTaxonomyForUser` (`hub-taxonomy-sync.ts`).

**Goal node motion:** Roadmap goals in **`GROWING`** show a slow, CSS-only ambient ring on the tree (`tree-goal-ambient-breathe` in `tree-view.tsx`, wired from `tree-render-goals-subtree.tsx` → `TreeGoalNodeSvg`). The animation is opacity on a thin stroke halo (~3.6s ease-in-out), not a full-node flash. **`BLOOMED` / `ENDED`** stay static. **`BUD`** keeps the existing inner opacity pulse **only when the goal panel is open** (selected); **`GROWING`** no longer stacks that inner pulse.

**Milestone UI:** In the tree goal panel, relational stages default to **title + completion** in the main row; a **+ / −** control toggles substeps and counts (`expandedMilestoneIds` in `tree-panel.tsx`). On the standalone roadmap page (`roadmap-client.tsx`), milestone **description** and the **subtask / daily-task** block stay behind a **Detail** toggle; the progress bar stays visible. Orbital hex dots now carry milestone **`position`** from projection (`milestone-tree-projection.ts`); first and last stage by `position` among all milestones use a slightly larger dot radius (~1.15×) on the tree.

**Seeds / fixtures:** `tree-test-profiles-seed.ts`, `mock-data.ts`, and `scripts/backfill-marks.ts` hub thread labels were updated to **Assets** / **Liabilities** for consistency with the locked template.

## 2026-05-16 — Theme & hub taxonomy v5 (17 hubs)

**Version:** `2026-05-19-v6` (`src/lib/taxonomy.ts`). Theme IDs unchanged; hub count is **17** (was 20).

| Theme | `LifeAreaId` | Label | Hubs |
|-------|--------------|-------|------|
| Money & Finance | `finance` | Money & Finance | Income, Assets, Safety net, Liabilities |
| Work & Career | `work` | Work & Career | Career, Skills, Builds & Launches |
| Who I'm Becoming | `becoming` | Who I'm Becoming | Purpose, Inner life, Joy |
| People & Relationships | `people` | People & Relationships | Family, Romance, Friendships |
| Health & Body | `health` | Health & Body | Movement, Nutrition, Appearance, Rest |

**Removed default hubs:** Network, Reflection, Habits, Community, Upgrades, Recovery.

**Legacy migration** (`LEGACY_HUB_MIGRATIONS` + `syncHubTaxonomyForUser`): Network → Skills; Projects → Builds & Launches; Reflection / Habits / Inner work / Mind → Inner life; Community → Friendships; Recovery / Sleep / Downtime → Rest; Upgrades → Appearance; `mind` on `health` → Appearance. Safety net name unchanged.

**Hub catalog (v6):** `src/lib/hub-catalog.ts` — per-hub `about`, `why`, `belongsHere`, `doesNotBelongHere`, `aiRoutingNote`, `examples`. Stream injects `aiRoutingNote` (hub + theme extract). Slug aliases preserve `projects` → `builds & launches`, `mind` → `inner life`.

**Moment subtype:** `LIMB_SUBTYPES.people` still includes `community` as a tag — not a hub name.
