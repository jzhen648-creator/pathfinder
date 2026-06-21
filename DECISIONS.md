# Decisions

> **Product decisions (read-first):** [`PATHFINDER-DECISIONS-LOG.md`](../PATHFINDER-DECISIONS-LOG.md) at workspace root — **wins** over rows in this file when they conflict.
>
> **Active client:** `pathfinder-mobile/`. Desktop tree UI is on hold — see [DESKTOP-ON-HOLD.md](./DESKTOP-ON-HOLD.md). Historical vision docs: [docs/archive/](./docs/archive/).

Short-lived engineering decisions and behavior notes. Prefer dates + one paragraph each.

## 2026-06-20 — Quick-question model v2 (principle-based generation, batch cadence, status-aware slots)

**Shipped:** Quick questions now generalize to any pursuit via a shared **generation principle** in `clarifier-prompt-blocks.ts` (reflect, enrich, and create paths all import the same blocks — no domain catalog). Per sync the model may return up to **5** clarifiers; mobile reveals **one at a time** (`PursuitClarifiersSection` shows `clarifiers[0]`; answered ids filtered client-side for instant next-on-answer; pending also visible on pursuit **Context** tab). **Stop rule:** prompt + hard cap + **7-day cooldown** (`quickQuestionsQuietUntil`) when the model returns `[]` on sync — **not** when the user finishes answering a batch (Option B). **QQ stop is decoupled from `hasMinimumContextSignal`** — that gate still governs milestone suggestions and theme benchmarks only; QQ coverage never blocks readings or milestones.

**Status behaviour:** `pick-question-slot.ts` — ACTIVE/MAINTAINING → forward `clarify`; COMPLETE → `retrospective` first (ids prefixed `retro-`); recently COMPLETE → `suggest_add` follow-on pursuit only after a retrospective answer; PAUSED → silent (`none`). Reflect user message now includes `<quick_question_slots>` per dirty pursuit (production path parity with enrich). **Status change:** `PATCH /api/goals/[goalId]` calls `pruneMootPendingClarifiersOnStatusChange` — drops forward pending on COMPLETE, all pending on PAUSE, clears cooldown; answered `enrichAnswers` untouched.

**Enforcement (4 former “0–1” points, all updated in place):** shared prompt lines (`buildClarifierSystemOutputLines`), `questionSlotUserMessageLines`, `filterClarifiersForQuestionSlot` (slice to 3 not 1), `gateEnrichResult` (status/cooldown/toggle only — not richness strip).

## 2026-06-20 — Pursuit detail panel supports tap-to-edit in place (relaxes "long-press owns metadata")

**Shipped:** Every displayed fact in `PursuitDetailPanel` is now tappable to edit in place — title → rename, theme/category eyebrow → category picker, icon badge → icon picker, status/date/significance chips → their pickers. Each tap opens the **same** editor long-press uses by rendering `MapNodeContextMenu` (`layout="centered"`, new additive `initialSubview` prop) + `PursuitIconPickerSheet` from the panel, and every mutation flows through the shared `usePursuitFieldMutations` hook. Tap and long-press are therefore the **identical** handler/cache/dirty path and cannot diverge.

**Why this supersedes the prior rule:** The 2026-06-20 note below ("Read-first departure: … Status, category, icon, title, deadline remain long-press / map metadata edits") made metadata editing hidden and unintuitive — long-press on the map was the *only* surface, and structured quick-question answers (`enrichAnswers`) had **no** visible or editable home at all. The read-first / "long-press owns metadata" rule is **intentionally relaxed**: the panel now owns tap-to-edit in place, and **long-press remains untouched as a shortcut** (`MapNodeContextMenu` on the map is unchanged; tap-to-edit is purely additive). The read-first insight card stays the visual hero — facts are quiet chips that only show an affordance on press.

**New Context segment (third tab beside Milestones | Connections):** lists answered quick-questions as editable facts — the question (quiet) + the answer (tappable to re-pick) — plus freeform notes with Clear, and a quiet empty state. The old collapsible "Context ›" row was removed (this segment replaces it). To make answers re-editable, `enrichAnswer` now persists the `options` offered when answered (additive optional schema field); editing re-uses the existing `POST /clarifier-answers` overwrite-by-`clarifierId` path, and a minimal `DELETE /clarifier-answers` endpoint removes a single answer. Legacy answers without stored options render read-only.

**Docs to reconcile (not edited this pass):** the "long-press owns metadata" framing in the Claude pack (`CONTEXT`/`AGENTS`-style docs) and the read-first departure note below now conflict with this decision — flag for the next Claude-pack sync per `SYNC-CHECKLIST.md`.

## 2026-06-20 — Quick-question answer collapse (single store + structured AI read)

**Shipped:** Quick-question answers live in **`Goal.enrichAnswers` only** — no longer mirrored into `PursuitContextEntry` (`clarifier_answer`) or `Goal.description` prose. Reflect **`map_context`** now includes structured `enrichAnswers` per pursuit row (`format-map-context.ts`). **`npm run build`** runs `migrate:qq-answer-collapse` before `next build` so prose stripping and structured AI read deploy atomically (no double-read window).

**Clear semantics:** **Clear context** wipes **authored notes only** (`description` + empty `manual_edit` log entry). **`enrichAnswers` survive** — quick questions are a separate lifecycle from the Context section.

**Second bug fixed (same pattern):** Clear previously set `description=""` but left the context log untouched, so the next log sync could **resurrect authored prose**. Clear now appends an empty `manual_edit` so `derivePursuitDescriptionFromLog` cannot rebuild cleared notes.

**Unchanged:** `hasMinimumContextSignal` / milestone-readiness gate still uses `enrichAnswerCount` from `enrichAnswers` exactly as before.

**Deferred cleanup (not this PR):** `ai_merge` context-log kind has no writers; `syncGoalDescriptionFromLog` is imported but unused in `goals/[goalId]/route.ts`.

## 2026-06-20 — Milestone readiness gate vs manual add (coupling)

**Shipped:** Pursuit detail panel supports **manual milestone add/delete** (`PursuitMilestonesList`) independent of AI readiness. Users can always add their own steps; the gate governs **AI suggestions only**.

**Coupling (intentional):** Quick-question answers (`enrichAnswerCount` on `Goal.enrichAnswers`) feed `hasMinimumContextSignal` in `pursuit-enrich-readiness.ts` — answering QQs is **one** way to earn AI milestone suggestions (along with description length, deadline + title, etc.). This coupling is deliberate; do not treat readiness as the only path to having milestones.

**Gate rules (unchanged):** `shouldSuggestMilestones` still blocks quantified-target pursuits (`hasQuantifiedTarget` — amount-tracked goals measure progress by the number) and sparse pursuits below the minimum-context bar. Manual add covers those cases.

**Read-first departure:** Milestone create/delete lives in the pursuit detail panel (not long-press metadata). Status, category, icon, title, deadline remain long-press / map metadata edits.

**Doc gap (TODO):** Live app has **manual** pursuit linking via `pursuitRelationship` rows. Claude-project docs (`PATHFINDER-AI.md`, `PATHFINDER-CONTEXT.md`) still describe AI-suggested connections as off-by-default — reconcile in a future Claude-pack sync; not edited in this pass.

## 2026-06-20 — Simplify QQs and milestones (durable context model)

**Shipped:** Three-source-of-truth model — structured fields + milestones own progress; quick questions capture **durable interpretation context** only (target type, route, constraint, preference, funding approach, etc.). Progress-stage QQs discouraged in `clarifier-prompt-blocks.ts`.

**Prompt:** `PURSUIT_PANEL_CONTEXT_PRECEDENCE` — milestones/status supersede stale progress-stage `enrichAnswers` in pursuit insight prose. Shared `SUGGESTED_MILESTONES_OUTPUT_LINES` in full reflect **and** `pursuits-only` reflect (fixes post-QQ Update AI reading returning insights but null milestones).

**Gate:** `shouldSuggestMilestones` decoupled from `hasMinimumContextSignal`. Hard blocks remain: quantified target, milestone cap. `hasMinimumContextSignal` still governs theme benchmarks and pursuit comparison only.

**No migration:** Existing progress-stage enrichAnswers treated as historical; milestones override in prompts.

## 2026-06-16 — Design slate open (major redesign)

**FOUNDER:** All **design rulings** are **negotiable** for the upcoming major visual/product pass. Prior docs used “locked”, “frozen”, and “structural vs mood-lock” — **retired as governance**. Replace with three buckets in [`claude-project/PATHFINDER-CONTEXT.md`](../claude-project/PATHFINDER-CONTEXT.md) §7:

1. **Shipped snapshot** — what the build does today (for screenshot/code alignment; not law)
2. **Exploration zone** — metaphor, materials, motion, typography, restraint, map chrome — **all open**
3. **Retired patterns** — Profile tab, hub zoom, marks on canvas, etc. — don’t resurrect without deliberate choice

Log accepted new direction in [`claude-project/PATHFINDER-PLAN.md`](../claude-project/PATHFINDER-PLAN.md) §13. [`pathfinder-mobile/DESIGN-BRIEF.md`](../pathfinder-mobile/DESIGN-BRIEF.md) and [`docs/archive/CURSOR-BRIEF-FEEL-PASS.md`](../docs/archive/CURSOR-BRIEF-FEEL-PASS.md) reframed to match.

## 2026-06-15 — Dirty reflect uses scoped map context; pace facts deferred

**Shipped:** `pursuits-only` reflect calls now send a scoped `map_context`: dirty pursuit(s), their same-category sibling pursuits, and the containing theme/category wrappers. Whole-map/full reflect still sends the full map context. Milestone pace facts stay in the reading packet, but are **not** injected into `<milestone_options>` yet.

**Rationale:** Panels-only and dirty pursuit refreshes were paying full-map token cost even when the output contract was one or a few pursuit panels. Same-category siblings preserve useful local comparison without making Gemini attend to unrelated themes. Pace facts in milestone suggestions may help later, but pre-QA they risk over-steering the model into timing judgments (“behind/on track”) that the packet deliberately does not compute. Defer pace-fact injection until device QA shows milestone suggestions remain generic or duplicated after the gate fix.

## 2026-06-15 — OPEN DECISION: pursuit progress model

**OPEN:** Pursuit progress model — milestone-driven (current/shipped) vs diary+slider (discussed June 4, never decided). Current: hex progress ring = milestone completion ratio (`orbitalFillLevel` in `pathfinder-mobile/components/map/PursuitMapNodeSvg.tsx`); progress captured via milestones + undated `description`. Alternative discussed: dated diary/journal entries replace milestone checkboxes as capture; subjective “how close do you feel” slider replaces milestone-count as the ring driver. The alternative conflicts with the milestone-driven model and is a meaningful pursuit-model redesign — **not** a backlog item to build, a fork to decide deliberately. Fenced until post-TestFlight.

## 2026-06-15 — RULING: iOS 26 liquid glass tab morph (private API)

**TECHNICAL (not aesthetic):** The iOS 26 Liquid Glass tab-bar **morph transition** (Instagram-style glass blob between tabs) uses a **private Apple API** unavailable to third-party / Expo apps. Do not hand-roll that morph. *(Historical Jun 2026: tab bar used `BlurView`; current mobile build uses a solid floating pill — `TabBarBackground.tsx`.)* Surface inventory: [`docs/archive/CURSOR-BRIEF-FEEL-PASS.md`](../docs/archive/CURSOR-BRIEF-FEEL-PASS.md) §iOS feel inventory.

## 2026-06-15 — AI sync reliability (no-op guard + resumable panels)

**Shipped:** Manual **Update AI reading** (pull-to-refresh on Reading) runs a **full reflect** when `force: true` — all theme readings and pursuit panels regenerate. Automatic background sync still skips when fresh. Batched reflect **commits each batch** before the next — partial panel progress survives batch-2 failures. Reflect mode shows **Finish pursuit insights (N)** when `pendingInsightCount > 0`. Pursuit panels support structured `fromMap` / `comparison` fields (not prefix parsing only). Theme `combined` / `contextual` beats are **hard-gated on read** (`GET /api/insights`) and on write.

**Rationale:** No-change Update was burning 2 Gemini calls and triggering rate-limit UX; all-or-nothing batching required multiple full refreshes for Alex-sized maps.

## 2026-06-15 — Background sync reverted to false

**Shipped:** `BACKGROUND_AI_SYNC_ENABLED = false` in mobile — manual **Update AI reading** only.

**Rationale:** Background sync was flipped on June 15 without T1–T6 validation. Auto-fire on AppState resume plus the retry loop after partial 429/503 turned a transient overload into a permanent-feeling rate limit (Gemini dashboard stayed clean). Revert until resume-sync + retry interaction is validated safe.

**Supersedes:** “Pre-TestFlight: background sync + reflect theme insights” entry below (reflect theme insights remain shipped; only background sync is reverted).

## 2026-06-15 — Pre-TestFlight: background sync + reflect theme insights

> **Superseded (2026-06-15):** Background sync reverted — see entry above. Reflect theme insights remain shipped.

**Shipped:** `BACKGROUND_AI_SYNC_ENABLED = true` in mobile — debounced ai-sync after map edits (~45s), pull-to-refresh triggers sync when readings are stale. Manual **Update AI reading** retained. Reflect Phase 2 (themes only): unified reflect call now writes per-theme insight panels (`themes` in reflect JSON → `InsightCache.themeInsights`); legacy digest/enrich deletion still deferred.

**Rationale:** TestFlight friends should not need to discover Insights for every map edit; theme detail panels already had UI wired to `cache.themes`.

## 2026-06-15 — timelineStart on create + reading rubric

**Shipped:** Mobile Build here / add pursuit captures optional **When did you start?** → `timelineStart` on `POST /api/goals`. Reading compiler uses `timelineStart` for pace facts at 0 milestone completions. Whole-map reading rubric tightened to Gap + Arrival lenses (Distribution lens removed).

**Rationale:** UI and AI packet disagreed on pursuit start date; sparse readings improved with two-lens rubric and paragraph guidance.

## 2026-06-15 — Reading packet gap movement signal

**Shipped:** Gap movement signal is asymmetric by pursuit type. For most pursuits, “movement” = milestone completion. For quantified pursuits (`targetAmount > 0`), “movement” = amount progress (`currentAmount > 0` suppresses gap), because the amount is the real progress signal, not milestones. CeMAP (no amount) flags on milestone-absence; Clear-debt (4200/10000) is suppressed. We do **not** compute pace (is the progress rate sufficient for the deadline?) — the packet cannot judge that reliably, and a false “stalled” flag is worse than a missed one. If finance-specific reading work happens later, this is the seam where amount-based pace logic would live.

**Code:** `computePursuitSignal` in `src/lib/map/compile-reading-packet.ts`.

## 2026-06-14 — Reflect Phase 1 (unified single Gemini call)

**Shipped:** `USE_REFLECT_CALL=true` on production — one `POST /api/map/ai-sync` tap runs `runReflectSync()` (Reading + all dirty pursuit panels in one Gemini call). Legacy two-call + enrich drain remains as fallback when flag is off. Mobile hides Finish/drain UX only when server returns `metrics.reflectCall: true` (not client flag alone). `AI_READING_DELIVERY_BYPASS=true` on production for QA cadence.

**Rationale:** Multi-pursuit status edits should update Reading and all panels in one tap; client-only reflect flag was hiding Finish while server still drained one pursuit per call.

## 2026-06-14 — Known divergence: `timelineStart` (UI vs AI packet)

> **Resolved 2026-06-15:** Mobile create flow captures optional start date; `POST /api/goals` persists `timelineStart`. Compiler pace facts use it at 0 completions.

**Was:** `timelineStart` existed on pursuit rows but was null on create — Timeline showed `createdAt` while AI packet omitted start date.

## 2026-06-14 — Sync router + free-tier delivery interval

> **Superseded (2026-06-14 brief):** Budget is **2** (`MAX_GEMINI_CALLS_PER_SYNC` in `sync-gemini-budget.ts`), not 3. Entry preserved for history.

**Shipped:** Pursuit enrich loops within 3-call ai-sync budget; enrich-only drain when story already current; create-burst full refresh (≥4 `pursuit_created` dirty rows); `pendingInsightCount` on sync response; `lastReadingDeliveredAt` + 2h free-tier delivery gate (`AI_READING_DELIVERY_INTERVAL_MS`, bypass `AI_READING_DELIVERY_BYPASS=true` for dev). Dirty ledger no longer cleared when `morePending`. Mobile: delivery cooldown UX, “finishing insights (N left)” copy.

**Rationale:** Two-pursuit edits should complete in one tap; large create bursts should full-batch; idle users should not spam Gemini; queued state stays visible when delivery is interval-blocked.

## 2026-06-14 — Week 1 AI consolidation

> **Updated 2026-06-15:** `BACKGROUND_AI_SYNC_ENABLED = true` pre-TestFlight. Pull-to-refresh on Insights and pursuit panels triggers sync when stale; refetch-only when fully synced.

**Product:** After map edits, the app schedules a **debounced background** `POST /api/map/ai-sync` (~45s idle, single-flight, 429-safe). Map utility chip shows **Reading queued** / **Reading map** / **Changes waiting**; Insights tab indicator unchanged. Pull-to-refresh on Insights (when stale) and pursuit panel flush sync immediately. Pursuit panel copy no longer routes users to Insights for routine updates. Enrich prompt may label body lines `From your map:` / `Comparison:` for layered pursuit insight display.

**Rationale:** Week 0 compiler reduced typical sync to 1 delta call; Week 1 removes navigation friction and batches session edits into 1–2 calls. Manual **Update AI reading** retained as override. Deferred: `apply-context` route, standalone `/enrich` endpoint.

## 2026-06-12 — Unlock ceremony removed

**Product:** Themes no longer require manual unlock. Creating a pursuit in a dormant theme auto-unlocks it (`unlockedLimbIds` set on first pursuit create). Retired: unlock tap, “Theme dormant” card, “Tap to unlock” copy.

**Rationale:** Ceremony with no cost is friction without meaning; “Tap to unlock” reads as paywall on iOS.

## 2026-06-12 — Sparse-map reading policy

**Product:** Readings scale with map depth. **1–2 pursuits:** short factual reading — names pursuits verbatim, one observation, one question; no life narrative. **3+ pursuits:** full panoramic reading.

**Prompt rules (all map sizes):** Verbatim-title rule (e.g. “£500,000 ISA” not “a significant ISA”). Filler ban: “it will be interesting”, “journey”, “keep building”, “as they take shape”.

**Rationale:** One-pursuit maps were being inflated into false life narratives, failing the “could this appear in someone else's app” test.

## 2026-06-12 — Marks confirmed staying

**Product:** Marks remain in the model. Pursuits are what you're doing; marks are what's true (life facts: “Passed CeMAP”, “Dad”, “Moved to London”). Marks ground readings in reality; removing them would blind every reading.

**Rationale:** UX simplification (introduce during onboarding) planned instead of model change.

## 2026-06-12 — Reading cadence: cooldown not schedule

**Product:** Free regeneration when `mapVersion` has changed (map meaningfully different). **Reading is current** quiet state when nothing changed. Hard floor: max one regeneration per 2 hours regardless. Dev bypass flag for testing (`EXPO_PUBLIC` dev flag or similar — implementation detail for later build).

**Rationale:** Fixed-day push rejected (punishes burst usage); unlimited refresh rejected (cost + slot-machine behaviour). Cooldown tied to `mapVersion` gives both freshness and restraint.

## 2026-06-12 — Copy fixes

**Product:** Insights footer **Rewrite** → **Update reading**. Settings benchmark caption “Used by Story for benchmarking context” → “Used by Insights for benchmarking context”. Debug section in Settings hidden in production builds.

## 2026-06-12 — Onboarding direction (planned, not built)

**Product:** Guided first-build onboarding approved in principle: welcome → about-you → “plant your first three” (one proud achievement marked Complete, one active pursuit, one mark) → first reading that names all three. Includes teaching card after first pursuit name: specific names make better readings (“£500k ISA” beats “savings goal”).

**Rationale:** Tutorial uses real user data, not placeholders. First map node is a win, not a task. Design session before implementation.

## 2026-06-11 — Insights reading sync (manual)

**Product:** **Update AI reading** on Insights is **manual only** — user taps the button (`POST /api/map/ai-sync`). Map **Changes waiting** chip navigates to Insights but does **not** auto-start sync. `canAutoRefresh` flags stale state only.

**Still deliberate:** Map mutations do **not** trigger AI until explicit **Update AI reading**. Creation mode unchanged.

**Supersedes:** 2026-06-11 “auto-reading on tab focus” entry below — that approach was not shipped on mobile.

## 2026-06-11 — Creation mode · Reflection sync

**Creation:** Pursuit create and map placement are offline — no Gemini on `POST /api/goals` (no `assignPursuitVisuals`). Icons are user-picked only.

**Capture:** Pursuit **Update** and **Add context** save pending `StreamRun` rows (`POST /api/goals/[goalId]/capture`, `/apply-context`, `/api/stream/pursuit/apply`) — no extract until sync.

**Reflection:** One tap **Update AI reading** on Insights → `POST /api/map/ai-sync` (bounded digest, dirty-ledger incremental refresh, optional story delta). Manual-only in dev; see mobile `PLAN-REFLECTION-SYNC.md` §10 for release cadence / monetization. Per-user serialized AI queue + rate cap.

## 2026-06-13 — Map Reading Compiler + terminology alignment

**Shipped (backend):** `compile-reading-packet.ts` — deterministic facts from pursuit attribute layers (status, deadline, significance, category, milestones) before Gemini. Feeds `generateReadingDelta` (compact packet vs nested changed JSON) and slimmed pursuit enrich prompts (`formatPursuitContext`). Dirty ledger extended with optional `details` JSON for before/after change events.

**AI interpretation ladder:** (1) app facts via compiler — silent; (2) **Quick questions** when pursuit title/context ambiguous; (3) AI prose for **Reading** + panel **Insight**.

**Terminology:** Retire user-facing **Insight ✦ / sparkle**. Use **Reading** (Insights tab), **Insight** (inline panel, `DetailInsightSection`), **Update AI reading**. Internal alias: **panel insight**.

**Docs:** `pathfinder/docs/READING-COMPILER.md`, updated TERMINOLOGY, ONTOLOGY, PLAN-REFLECTION-SYNC.

**Future:** Relationship Quick questions (MC between two pursuits) — not built yet.

## 2026-06-13 — Incremental AI sync pipeline

**Shipped:** `AiReadingDirtyItem` ledger; bounded resumable digest (5/tap); `generateInsightsAndStory` on full refresh; incremental pursuit insights + `generateReadingDelta` on small edits; deferred memory updates; sync `metrics` + no mobile auto-retry on 429.

**Future:** Reading delivery interval (e.g. hourly) on free tier; faster/on-demand as paid — see `pathfinder-mobile/PLAN-REFLECTION-SYNC.md` §10.

**Retired:** Map-wide Stream UI, instant apply on note save, Stream as product word on mobile (+ tab is **add on map**).

## 2026-06-11 — Work category Job rename + category UI lock

**Taxonomy:** `Career & role` → **Job** under Work & Career; `TAXONOMY_VERSION` → `2026-06-11-v10-work-job-category`. Legacy aliases `career`, `career & role` → slug `job`. Prod sync via `hubTaxonomyVersion` on login.

**UI:** Mobile shows **category** (not section) for taxonomy slots — theme detail group headers, pursuit eyebrow, Build here picker, long-press menu row. Source of truth: `pathfinder-mobile/TERMINOLOGY.md`.

## 2026-06-11 — Taxonomy Phases 2–3 (category rename cutover)

**Prisma (client names, SQL columns unchanged via `@map`):** `ThemeCategory`, `Goal.categoryId`, `Mark.categoryId`, `Goal.status`, `StreamRun.categoryId`, `isSystemCategory`, `parentCategoryId`, `User.taxonomyVersion`. `TAXONOMY_VERSION` → `2026-06-11-v11-category-rename`.

**Backend modules:** `category-catalog`, `system-categories`, `category-dedupe`, `taxonomy-sync` (hub-* shims kept). `fillThemeExtractCategorySlugs` mirrors `categorySlug` on extract items.

**API:** `GET /api/map-data` primary (`categories[]` first); `/api/branches` deprecated alias. New `/api/categories/*` routes mirror branch subroutes.

**Mobile:** `useMapData`, `mapDataQueryKey`, `categoriesFromMapData`, `categoryId` on map nodes; deprecated `useBranches` / `branchId` shims.

**Prod after deploy:** run `npm run backfill:taxonomy` (bumps `taxonomyVersion`), then optional `backfill:retire-identity`, `backfill:retire-practice`, `backfill:flatten-goal-lineage`.

**Deferred:** ~~physical SQL column rename; `limbId` → `themeId`~~ **done** (see next entry); Stream v2 reject `hubId`-only; desktop tree hub vocabulary.

## 2026-06-11 — Physical SQL rename: categoryId + themeId columns

**Migration:** `20260611180000_rename_category_theme_columns` — Postgres `branchId` → `categoryId` (Goal, Mark, StreamRun); `limbId` → `themeId` (Branch, Mark, Goal, StreamSession, StreamRun). Index + FK constraint renames included.

**Prisma:** Removed `@map("branchId")`; model fields use `themeId` directly. JSON API still mirrors `branchId` / `limbId` via `category-id.ts` + `theme-id.ts`.

**Still @map / legacy SQL:** `Branch` table name, `parentBranchId`, `isSystemHub`, `hubTaxonomyVersion`, `bloomStatus` column on Goal.

**Version:** `TAXONOMY_VERSION` → `2026-06-11-v12-sql-category-theme-columns`.

## 2026-06-11 — Taxonomy Phase 2 slice 1 (aliases, no migration)

> **Superseded** by **2026-06-11 — Taxonomy Phases 2–3** and **Physical SQL rename** below. Kept for history.

**API:** `GET /api/branches` returns `categories[]` (duplicate of `branches[]`). `GET /api/map-data` aliases the same handler.

**Mobile:** `TaxonomyCategory` type, `default-category.ts`, `taxonomy-categories.ts` re-exports; `geometry.ts` no longer emits mark map nodes (marks stay in theme detail only).

**Unchanged at slice time:** `branchId`, Prisma `Branch`, `useBranches` hook name — all since migrated.

## 2026-06-11 — Retire goalType from product model (supersedes identity in practice decision)

**Product model:** pursuit + **status** only — no project/identity/practice subtypes in UI or Stream prompts. All creates and Stream commits persist `goalType: project`. Ongoing rhythms use `bloomStatus: MAINTAINING`.

**Stream:** extract JSON omits `goalType` (optional legacy ingest values normalize on commit). Milestone suppression uses **MAINTAINING** status only.

**Backfill:** `npm run backfill:retire-identity` migrates existing `identity` rows to `project` (preserves bloomStatus).

## 2026-06-11 — Retire `practice` goalType (use Maintaining status)

**Product model:** pursuit + status only. Ongoing habits / maintenance rhythms use `goalType: project` + `bloomStatus: MAINTAINING`. **`identity`** stays for “who I'm becoming” pursuits (no milestones).

**Stream:** prompts emit `project|identity` and `MAINTAINING` in bloomStatus; legacy `practice` in extract JSON is normalized on commit to `project` + `MAINTAINING`.

**Milestones:** suppressed for `identity`, `MAINTAINING`, and legacy `practice` rows (`goalAllowsStreamMilestones`).

**Backfill:** `npm run backfill:retire-practice` in `pathfinder/` migrates existing `practice` goals.

## 2026-06-11 — Taxonomy language lock (Phase 1)

> **Partially superseded:** categories are **visible in mobile UI** as of **Work category Job rename + category UI lock** (same day). Phase 1 “hidden category” rule applied only before category pickers shipped.

**User-facing model:** theme · pursuit · mark. **Category** is the doc word for taxonomy slots under a theme (23 locked templates).

**Rules:**
- Mobile UI copy source of truth: `pathfinder-mobile/TERMINOLOGY.md`.
- Do not show hub, track, or branch in mobile UI copy.
- Phases 2–3 shipped 2026-06-11 — see `TAXONOMY-CLEANUP.md` *Shipped state*.

## 2026-06-08 — Taxonomy v8: Play & Leisure theme restored (`2026-06-08-v8-play-leisure`)

**Status:** Frozen taxonomy change. `TAXONOMY_VERSION` → `2026-06-08-v8-play-leisure`. Six themes, **20** system hubs (was 17).

**Play & Leisure** (`pleasures`) returns as a sixth theme with display label **Play & Leisure** and three hidden hubs for AI classification only: **Hobbies** (palette), **Culture** (book-open), **Experiences** (map-pin). Leisure was previously folded into Self & Mind → Joy; with hubs hidden from users, the theme name must carry leisure scope.

**Rules:**
- No retroactive data move — existing Joy pursuits on `becoming` stay put.
- `hub-taxonomy-sync` no longer folds `limbId: pleasures` into `becoming`.
- Legacy label migrations for hobbies/culture/experiences on old `becoming` rows unchanged.
- Mobile map: **3-3 symmetric canopy** (top: becoming | pleasures | finance; bottom: people | health | work). Theme colour `#FF9F6B` (warm apricot).
- Stream extract: `STREAM_PLAY_LEISURE_THEME_BOUNDARIES`; Self & Mind boundaries narrowed (leisure → pleasures).

## 2026-06-08 — Hidden tracks on mobile (UI only)

> **Superseded** by **2026-06-11 — Work category Job rename + category UI lock**. Categories are now visible (group headers, pursuit eyebrow, pickers). Hub/track **words** remain banned in UI.

**Historical (2026-06-08):** Tracks/hubs were silent-assigned only — no picker, flat theme detail, no track subtitle on map labels.

**Silent assignment (still used when user picks theme only):** `defaultCategoryIdForTheme()` in `pathfinder-mobile/lib/map/default-category.ts`.

## 2026-06-08 — App simplification: one store, marks as theme context

**Map is the single store.** Pursuits on the map surface; marks in theme detail panels as context (facts, events, people, skills). Optional mark dates (`Mark.date` nullable). Story/Insights read full mark text via `formatMapContext` theme-level `marks` arrays.

**Profile tab retired.** Tab bar: Map · Story · **+** · Settings. Name / age / location in Settings (`UserManualProfile`). `formatUserContext` reads manual profile only — no `UserMemory` blob. Mobile stopped calling memory pipeline (`postMemoryUpdate`, etc.); backend `/api/memory` left dormant.

## 2026-05-28 — Trunk theme slot reorder for visual balance

Reordered trunk/theme rendering arrays to bias denser themes toward the middle of the trunk ladder for better visual balance and reduced crowding in upper/lower extremes. The active top-to-bottom slot order is now: Who I'm Becoming, Money & Finance, Health & Body, Work & Career, People & Relationships. This is an array reorder only with no schema or API changes.

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

## 2026-05-27 — Session 16 — Mobile map architecture: vertical scroll → radial pan/zoom canvas

The mobile map moved from a vertical `ScrollView` path to a fixed radial tree canvas. The mobile renderer still owns its own geometry (`pathfinder-mobile/lib/map/geometry.ts`) and does not import desktop tree geometry, but it now mirrors the desktop topology: central trunk, authored theme attachment heights, theme limbs, hub fans around gateways, and a pan/pinch camera. `/api/branches`, `/api/marks`, and `MapNode` ids/kinds remain unchanged.

**Mobile trunk parity (shipped):** vertical trunk canvas (1360×1800), desktop-style pursuit wedge layout, icon medallions, label LOD with pinch ramps, inactive-theme dimming, parallel flow filaments (lightweight port of desktop conduit language), pursuit `bloomStatus` visuals, hub activity emphasis, and camera fit that includes halos/labels—not just logical radii.

**Intentionally mobile-specific:** react-native-svg renderer (not desktop SVG tree module), inline `MapMarkCard` instead of routing every mark tap to a sheet, fewer filaments per segment, and no sibling-swipe / path-sliding navigation yet.

**Deferred:** full desktop material staging, sibling swipe between themes/hubs, path-sliding along branches.

## Session 16 — Mobile map direction reset

After three iterations, mobile map architecture is being rebuilt from scratch with a motion-first linear journey model. See MOBILE-VISION.md (rewritten this session) for the full spec.

**Iterations explored before arriving here:**

1. Vertical scroll, themes chained in a string (original "Candy Crush" model). Failed: the path-as-string metaphor swallowed the trunk. Themes felt like beads on a wire, not landmarks on a journey.

2. Radial pan/zoom canvas with central trunk (Session 16 first attempt). Failed: two-finger pinch is too fiddly on iPhone; top-down camera kills the sense of journey; outer themes hard to reach.

3. Linear journey with bottom sheet, dual-driving state, faux perspective via scale, snap-to-stop scrolling, motion-first design (this iteration). Committed.

**What survives the rewrite:**
- Living-spine ribbon math
- Active-theme weighting
- All data hooks and MapNode contracts
- Routes used for deep linking only

**What was thrown away:**
- Radial geometry
- Pan/pinch camera
- Viewport-centre legend probe
- Vertical Bézier chain trunk between themes

**Implementation phases:**
- Phase 1: Linear geometry + snap-scroll skeleton
- Phase 2: Bottom sheet + dual-driving focus state
- Phase 3: Faux perspective + Reanimated springs + haptics
- Phase 4: Motion polish

**Reference apps:** Apple Maps, Strava, Spotify Now Playing, Linear.

Status: Vision locked. Phase 1 next.

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

Implements the product concept in **Stream** below. Per-category overlay: user dumps text/voice → **`POST /api/stream/extract`** classifies items (pursuits, timeline notes, ambiguous) with theme/category context → confirmation queue → **`POST /api/stream/commit`** writes accepted rows. `Mark.kind = stream` records provenance. Requires `GEMINI_API_KEY`. Unified insertion uses **`POST /api/categories/[categoryId]/nodes`**. See [`CHANGELOG.md`](./CHANGELOG.md) (2026-05-16).

## 2026-05-16 — Progressive hub reveal (`isActive` / `isSystemHub`)

New profiles get **17** system categories from `LOCKED_CATEGORY_TEMPLATES` (`system-categories.ts`) with `isSystemCategory = true`, `isActive = false`. Onboarding (or **`POST /api/themes/activate`**) sets `isActive` for user-chosen themes. Map data and APIs filter to active roots so the canopy grows with the user. Categories that already had goals/marks are backfilled active in migration `20260517100000_add_branch_hub_visibility`. System categories are protected from wipe scripts.

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

## Session 16 Phase 3 — Tap interactions

Tap wiring complete. Theme taps and back button working.

Status: COMPLETE.

## Session 16 Phase 4 — Map MVP foundation

Phase 4 scope narrowed intentionally. The interaction model is:

- **Overview:** pan the map (single finger, bounded)
- **Tap** theme / hub to drill in; tap pursuit / mark for detail routes
- **Back** to move up one level

Deferred as over-complex for now:

- Sibling swipe between themes or hubs
- Path-sliding navigation along branches
- Overview pinch zoom

Also shipped in this phase: hub camera fix, node spacing increases, render-only visual differentiation (theme medallion / hub ring / pursuit dot), removal of dev chip bar and overview crosshair.

Status: MVP foundation locked. Phase 5 = motion polish (springs, haptics).

## Session 16 Phase 5 — Motion polish

- Shared spring configs in `lib/map/cameraMotion.ts` (glide, reset, UI chrome)
- Camera glide tuned for ~300–400ms feel (damping 26, stiffness 210)
- Haptics: light impact when drilling deeper (overview → theme → hub); soft impact when backing up
- Selection haptic on theme/hub tap for immediate feedback
- Pan/pinch release springs for subtle settle after manual exploration

Status: COMPLETE. Map interaction stack Session 16 is done.

## 2026-06-04 — Theme-confident placement; hubs best-guess; ambiguous machinery dormant

**Decision.** Stream's confident unit of placement is the **theme**, not the hub. The
extractor drops each pursuit/mark onto a best-guess hub within the chosen theme as a
low-stakes default. The boundary-adjudication / ambiguous-flagging behaviour is removed
from the extractor prompts — the model no longer defers or flags placement, it always
emits.

**Why.** Every pursuit fits cleanly into one of five themes; the same is not true of
seventeen hubs (gaps + overlaps → boundary bugs, empty-hub "report card" feeling). Aim
the AI at the grain it's near-perfect on (theme) and stop forcing the grain it gets wrong
(precise hub). On the rare miss the user re-drags — `moveToHub` already supports this.
Spend freed from filing moves to enrichment (relating a new pursuit to existing ones).

**Scope of change (Option B — behaviour now, no migration).** Prompt-only edits to
`stream-extract.ts` (hub + theme extractors). Goals still attach to hub Branch rows in
the data — this is NOT a goal→theme migration (that's Option A, deferred). No taxonomy
version bump: the locked schema (TAXONOMY_VERSION 2026-05-19-v6, 17 system hubs) is
unchanged. Best-guess placement relies on the existing `fillThemeExtractHubIds` /
`inferHub` fallback, which already always returns a slug.

**Deliberately left dormant — DO NOT "clean up" without a separate decision.** The
ambiguous / needsResolution machinery is kept in place but inert: `ambiguousItemSchema`,
`resolvedAmbiguous`, `stream-commit-ambiguous.ts`, `/api/stream/resolve-ambiguous`,
`Mark.needsResolution` / `streamAmbiguousId`, and all tree/mobile unresolved-node
rendering. With the prompt emitting `ambiguous: []`, the route's ambiguous-commit blocks
are no-ops. Full excision (9-area removal surface, inventoried in the Option-B audit) is
a separate deferred prompt. A future session must not delete this code assuming it's dead
— it was retained on purpose, pending a decision on whether a lighter "flag this one"
affordance is wanted back.

**Enrichment.** `STREAM_PURUIT_REVIEW_RULES` description bullet strengthened to relate a
new pursuit to existing map pursuits in plain second person, hard-constrained to pursuits
present in context (never invent a relationship). Shared block, so global pursuits gain it
too (benign).

**Companion doc.** See `POSITIONING-theme-placement.md` (theme placement · emergent
decorative hubs · enrichment-first AI · hub-as-render-layer) for full direction, including
the deferred work: emergent hub-clustering as a render pass, and the pursuit-scope wiring +
false-child brake.

**Status.** Built, typecheck/lint clean. Pending dogfood validation of three behaviours:
dedup-vs-continuation (next-chapter must become a continuation, not a silent omission),
best-guess placement (out-of-theme item lands visibly, not dropped), and relational
enrichment firing without fabricating on sparse maps.

## 2026-06-06 — Pursuit Lucide icons · Phase 1 (icon foundation)

Installed `lucide-react-native@1.17.0` in mobile. Enumerated **1713** kebab-case icon slugs from the installed package `.d.ts` (source of truth — not lucide.dev). Copied `docs/pursuit-icon-list.md`; parsed **194** preferred override rows (Pleasures section excluded; 23 ⚠️ custom-commission rows). **125** slugs in the tree-shaken import map (124 resolved override slugs + `sparkles`); aliases applied where markdown names differ (`home`→`house`, `palm-tree`→`tree-palm`). Unresolved override slugs in raw markdown: `broom`, `home`, `palm-tree`, `waves` — generator normalizes or nulls these; pursuits fall through to AI/theme icon.

Artifacts: `pathfinder-mobile/lib/icons/pursuit-icon-catalog.ts`, `PursuitIcon` wrapper, `scripts/pursuit-icon-audit.json` (audit diff only), `pathfinder/src/lib/icons/pursuit-icon-overrides.ts`. Dev preview: `/dev/pursuit-icons`. No schema, map render, or Stream changes in this phase.

## 2026-06-06 — Pursuit Lucide icons · Phase 2 (data model)

Added optional `Goal.iconName` (`String?`) — kebab-case Lucide slug; null means render theme icon. Migration `20260606200000_goal_icon_name` applied to Supabase. No taxonomy bump. Field flows on **`GET /api/branches`** with full goal rows (same payload as `title` / `shortLabel`); mobile `BranchGoal` type updated. No UI consumption, no AI assignment, no map geometry changes in this phase.

## 2026-06-06 — Pursuit Lucide icons · Phase 3 (icon assignment at creation)

Added `assignPursuitIcon()` — separate from Stream extract. Resolution order: preferred override match (word-boundary concept matching) → AI JSON pick from **live** `lucide@1.17.0` enumeration (`enumerate-lucide-slugs.ts` reads installed package `.d.ts` at runtime, not audit JSON) → validate slug → persist or `null`.

Wired into pursuit creation: `stream-commit` `createNewPursuit`, `POST /api/goals`, `stream-child-pursuit`, ambiguous mark → pursuit resolution. Failures are non-blocking (`assignPursuitIconSafe`). Override matcher uses word boundaries to avoid false positives (e.g. `visa` inside "Invisalign"). No map render changes in this phase.

## 2026-06-06 — Pursuit Lucide icons · Phase 4 (map render)

Threaded `Goal.iconName` through map geometry: `MapNode.iconName` set alongside `label` in `geometry.ts`; `patchLayoutPursuitVisuals` patches `iconName` and title without relayout. Map render uses **`PursuitMapIconOverlay`** — absolute-positioned `PursuitIcon` Views after the map `Svg` (Lucide icons are standalone `Svg` roots and cannot nest inside `react-native-svg`). Icons centered on pursuit hex at ~60% of diameter; hidden for seed/compact radii; opacity matches node visibility and dims on complete pursuits. Fallback: theme limb via `PursuitIcon`, then sparkles.

## 2026-06-06 — Pursuit Lucide icons · Phase 5 (app-wide migration proposal — plan only)

Follow-up pass after Phases 1–4 ship. **No code in this phase** — product decision + execution backlog for a future sprint.

### Mixed styles on the map (decision required)

Phases 1–4 leave **two icon languages on the map canvas**:

| Layer | Source | Style | Role |
|-------|--------|-------|------|
| Theme hex (5) + hub hex (18) | Custom SVG (`limb-icons`, `branch-icons`) | Pathfinder brand strokes | Territory / taxonomy identity |
| Pursuit hex | Lucide via `PursuitIcon` | Standard Lucide 24×24 stroke | Pursuit semantic shorthand |

**Options:**

- **A — Accept mixed styles everywhere on map:** Keep bespoke theme/track art; pursuits stay Lucide. Lowest effort; style clash visible at theme/hub focus where both appear together.
- **B — Migrate theme icons to Lucide:** Replace 5 limb icons with fixed Lucide equivalents (`Briefcase`, `Wallet`, `Sparkles`, `Users`, `HeartPulse`). Unifies pursuit + theme hexes; loses bespoke brand artwork. Hub/track icons still mixed unless also migrated.
- **C — Hybrid (recommended default):** Keep custom theme + track icons **inside map hex layer only**; migrate **nav, utility bar, Stream, panels, and secondary routes** to Lucide. Accepts mixed styles on the map; unifies everything outside the hex canopy.

**QA gate before choosing:** Screenshot theme focus with pursuits visible; judge whether pursuit Lucide + custom theme/hub icons feel coherent enough for Option A/C. If clash is too strong, escalate to B for theme icons only (not full track migration).

### Keep custom (brand-critical)

| Asset | Location | Reason |
|-------|----------|--------|
| 5 theme limb icons | `limb-icons.tsx`, map theme hex | Distinct Pathfinder visual language |
| 18 track branch icons | `branch-icons.tsx`, map hub hex | Taxonomy-specific artwork; no 1:1 Lucide set |
| `MapBrandMark` | map utility bar | Product mark |
| `PursuitStatusGlyph` | detail panels | Status shape language tied to hex bloom states |
| Mark detail glyph | `mark/[id].tsx` | Empty bordered square — no Lucide equivalent |

### Migrate to Lucide (high value, low risk)

Introduce a thin **`AppIcon`** wrapper (named Lucide imports only — same tree-shaking pattern as `pursuit-icon-catalog.ts`; ~20–30 slugs, not the full 1713). Suggested mappings:

| Current | File(s) | Lucide |
|---------|---------|--------|
| `MapTabIcon` (pin SVG) | `components/nav/MapTabIcon.tsx` | `MapPin` |
| `StoryTabIcon` | `components/nav/StoryTabIcon.tsx` | `BookOpen` |
| `SettingsTabIcon` | `components/nav/SettingsTabIcon.tsx` | `Settings` |
| `ReviewTabIcon` (hidden tab) | `components/nav/ReviewTabIcon.tsx` | `ShieldCheck` |
| Stream FAB `+` | `StreamTabBarButton.tsx` | `Plus` |
| Search `⌕` | `MapUtilityBar.tsx` | `Search` |
| Recenter `◎` | `MapZoomControls.tsx` | `LocateFixed` |
| Edit `✎` / close `✕` | `ConfirmationCard.tsx`, `PursuitDetailPanel.tsx`, `MapOverlayCard.tsx` | `Pencil`, `X` |
| Add `+` | `DetailDashedAction.tsx`, milestone rows | `Plus` |
| Settings clock `◷` | `settings.tsx` ListRow | `Clock` |
| Stream `◎` | `StreamPrimaryButton.tsx` | `Mic` (voice-forward) or `CircleDot` |
| Insight `✨` | `InsightSparkle.tsx` | `Sparkles` |
| Scope `●` | `StreamScopePill.tsx`, `StoryThemeChip.tsx` | `Circle` with fill |
| Chevron `›` | `ListRow`, `HubListRow`, `ActionCard`, `StreamThemePicker` | `ChevronRight` |
| Back `←` | `BackButton`, `DetailPanelNavBar`, `Composer`, onboarding | `ChevronLeft` (drop unicode arrow text) |
| Check `✓` | `tasks.tsx`, `PursuitDetailPanel.tsx` | `Check` |

**Delete after migration:** `MapTabIcon.tsx`, `StoryTabIcon.tsx`, `SettingsTabIcon.tsx`, `ReviewTabIcon.tsx` (4 bespoke nav SVG files).

### Suggested execution order

1. **`AppIcon` + nav tab bar** — highest visibility, validates Lucide sizing/stroke in tab chrome
2. **Map utility bar + zoom controls** — search, recenter
3. **Stream + confirm** — FAB, composer back, edit/close, scope pill
4. **Detail panels + shared UI** — chevrons, back buttons, `InsightSparkle`, dashed actions
5. **Secondary routes** — settings, tasks, onboarding back links
6. **Desktop web** (if UI resumes) — parallel `lucide-react` + shared slug names; out of scope while desktop is on hold

**Estimated touch:** ~18 mobile files, 1 new shared module (`app-icon-catalog.ts`), 4 deletions. No API or schema changes.

### Implementation notes

- **Stroke weight:** Lucide defaults to `strokeWidth={2}`; tab/nav icons currently use `1.5`. Standardize on `1.75` or `2` app-wide for Lucide chrome; keep custom map hex icons unchanged.
- **Size:** Nav tabs `22`, utility bar `20`, inline chevrons `16–18` — match existing tap targets, not Lucide's 24 default.
- **Do not** replace theme/track map icons or `PursuitIcon` in this pass unless product chooses Option B.
- Re-run `audit-lucide-exports.mjs` if `lucide-react-native` is upgraded; `AppIcon` catalog is independent of pursuit catalog but should share version pin.

### Acceptance criteria (when executed)

- No unicode glyph used as a functional icon in nav, map chrome, Stream, or detail panels
- Tab bar + Stream FAB visually consistent with pursuit hex Lucide weight
- Custom theme/hub hex icons unchanged (unless Option B approved)
- `npx tsc --noEmit` clean; spot-check map overlay icons still render after utility bar migration

**Product decision (2026-06-06): Option C — Hybrid.** Custom theme + track icons stay on map hex layer; Lucide everywhere else.

## 2026-06-06 — Pursuit Lucide icons · Phase 5 executed (Option C)

Shipped **`AppIcon`** + **`app-icon-catalog.ts`** (18 tree-shaken Lucide slugs) and **`BackChevronLabel`** for nav/UI chrome. Migrated: tab bar, Stream FAB, map utility search + zoom controls, back affordances, chevrons, edit/close, checkmarks, `InsightSparkle`, scope pills, settings row icons. Deleted bespoke `MapTabIcon`, `StoryTabIcon`, `SettingsTabIcon`, `ReviewTabIcon`. **Unchanged:** `limb-icons`, `branch-icons`, `MapBrandMark`, `PursuitStatusGlyph`, mark glyph, `PursuitIcon` map overlay.

## 2026-06-05 — Mobile Phase A: Profile + FAB add-pursuit lanes

Separated **intake entry points** so centre FAB and Self node never share a doorway:

| Entry | Behaviour |
|-------|-----------|
| **Centre + FAB** | Always **`openAddPursuit()`** → `AddPursuitFlowSheet` (theme → track → `AddPursuitForm` → `POST /api/goals`). Never opens map Stream sheet or Stream theme-picker-to-Stream path. |
| **Self node (map base overview)** | **`router.push("/(app)/profile")`** — identity/context screen. Verified `openWholeLifeGuidance()` was only `router.push("/(app)/story")`; Story tab remains the reading entry. |

**ThemePicker coupling (Decision 2 — pure branch):** Former `StreamThemePicker` was a pure callback + list (`PageSheet`, `LIFE_AREAS`, `onSelect`) with no map canvas or Stream session imports. Renamed to **`ThemePicker`** (`components/map/ThemePicker.tsx`) with embeddable **`ThemePickerList`**. FAB from Story/Settings opens **`AddPursuitFlowSheet` in place** (no forced tab jump). After create, if the user was not on Map, **`router.navigate("/(app)/map", { openPursuit })`** so the new pursuit lands on the map as a reward — not a prerequisite.

**Add pursuit flow context:** Map registers `registerMapAddPursuitBridge` while focused — seed from `resolveAddPursuitSeed(cameraFocus)`: base → theme step; theme (no highlighted track) → track step only; theme with highlighted track or pursuit focus → form with **`defaultBranchId`** (changeable when multiple tracks). FAB subtitle: **"Add pursuit"** + optional track label from map focus.

**Profile screen:** `app/(app)/profile.tsx` composes existing `ProfileMemorySection`, `ProfileKeyFacts`, `ProfileFactsSection`, `EditProfileModal`. Settings unchanged (duplicate profile content OK for now). Hidden route (`href: null`); opened from Self node or deep link.

**Explicitly not in this phase:** goals/parse Describe mode, Profile intake composer, Settings trim, onboarding changes, deleting map-Stream code. Map sheet Stream (`openStream=1`, hub Stream buttons, inline pursuit Stream) remains for legacy/deep links.

## 2026-06-05 — Profile memory blob: editable record + Option B pause

**Rule:** If the user can edit it → Profile. If it regenerates from their data → Story. Story tab untouched; blob generation prompts (`profile-memory.ts`, `UPDATE_SYSTEM`, `SEED_SYSTEM`) unchanged.

**Editable blob:** `ProfileMemorySection` inline edit/save via existing **`PATCH /api/memory`** (`patchUserMemory`). Dossier styling (sans note card, visible Edit/Write, utilitarian section labels). Framing: *"What Pathfinder knows about you — edit anything here."* Footer meta: last updated · N facts · used by Story & Insights (`updatedAt`-driven, not `lastUserEditedAt`).

**Option B — pause auto-overwrite (confirmed):** One manual save sets **`lastUserEditedAt`** and **permanently pauses** auto `updateUserMemory` until the user explicitly incorporates. Guard at top of `updateUserMemory`: when `lastUserEditedAt` is set and not `forceIncorporate`, **`markUserMemoryDirty` + return null** (no silent overwrite). Paused POST returns **`200 { ok: false, paused: true, isDirty, pendingIncorporateCount }`** — expected, not an error toast. **TODO:** future "Resume automatic summary updates" affordance.

**Incorporate watermark (no migration):** On successful incorporate, **`lastUserEditedAt = now`** — pause persists (still blocks auto-updates) but acts as watermark so the next pull excludes already-folded sessions. **`processedForProfileAt` not used** for this path. Pending sources: **`StreamSession`** rows + applied **`StreamRun`** rows with `createdAt > lastUserEditedAt`. Text joined most-recent-first, capped 8000 chars.

**StreamSession coverage fixes (in scope):**
- Client **`postMemoryUpdate`** (empty-extract queue, mark-only save): **`persistStreamSessionForMemory`** in `POST /api/memory/update` before guard; mobile passes **`limbId`** from scope.
- **`commitStreamToHub`**: was missing both session persistence and memory queue; extended hub commit schema with `inputText` fields + **`recordStreamThemeSession` + `queueMemoryUpdateAfterStream`**.
- Pursuit inline Stream (`StreamRun` apply / child pursuit): covered via **`StreamRun`** in pending query (no duplicate `StreamSession` required).

**`isDirty` repurposed:** Only memory pipeline + Profile UI — safe as **"pending incorporate"** when pause is active.

**GET seed guard:** Skip `seedUserMemory` when **`lastUserEditedAt`** is set (intentional empty/cleared blob not re-seeded). **`PATCH`** allows empty blob with `allowEmpty + userEdited`.

## 2026-06-05 — Product ontology + surface cleanup

**Frame (canonical):** Two stores (Map = structured truth, Profile = unstructured truth), one view at two scopes (Story = whole-map, Insights = node-level — same regenerated view, different zoom), one input verb decomposed into **+ → Map** and **Profile tab** (Self node decorative on map). Views own no truth; stores are editable and authoritative (Map for structure, Profile for self-description); Story reconciles the two and names divergence. The "too many information sets" concern resolved to **vocabulary + cleanup**, not a structural merge.

**Stream vocabulary collision:** Added to [`ONTOLOGY.md`](./ONTOLOGY.md) dangerous-collisions list. Three meanings: **(a)** retired map-wide extract surface, **(b)** live pursuit-scoped apply, **(c)** backend input pipe. UI copy: **Update pursuit** / **Capture progress** for (b); **Describe** / **Capture** for (c); forbidden bare **Stream** as a destination in new copy. Code `stream/*` paths retained this pass.

**Map-wide Stream retirement (mobile):** Removed map sheet streaming/confirming mode, `useStreamSession` on map, `registerMapStreamOpen` / `openStream=1` handlers, theme-modal inline Stream. Legacy `/stream` route redirects to map (no theme-picker → stream sheet). **Kept:** `/api/stream/extract` + commit routes, `PursuitInlineStream`, pursuit apply API, memory incorporate pipe.

**Settings dedupe:** Profile sections removed from Settings; single **Profile** link row. Profile is the one home for memory blob + facts.

**Insights voice parity:** `generate-insights.ts` SYSTEM_PROMPT aligned with Story GROUND TRUTH / anti-flattery treatment; peer `contextual` kept at node scope when age+location known.

## 2026-06-05 — Profile tab promotion

**Self-node Profile entry removed; Profile promoted to tab.** Tab order: Map · Story · **+** (centre) · Profile · Settings. Profile tab is icon-only (person glyph) to avoid label truncation at five slots.

**Reasoning:** Convergence-point Self tap was unintuitive in device use. Profile is a **store** — it belongs in primary navigation, not a hidden map affordance. Self node remains on the map as a decorative centre anchor only (spokes + visibility at base focus).

**Also shipped:** Map tab re-press while focused returns to overview (exits edit-map if open). Profile screen uses `ScreenHeader` (no back chevron on tab root). Settings Profile link row removed (redundant with tab).

## 2026-06-14 — Archive is the sole map removal mechanism

**Abandon pursuit removed from long-press menu.** Two overlapping removal paths existed: **Abandon pursuit** (`status: ABANDONED`, no `archived`) and **Archive pursuit** (`archived: true`). Abandoned pursuits left the map and AI context but did not appear in Settings → Archived pursuits — no UI to find or restore them. **Archive** remains the only removal action: reversible via Settings → Archived pursuits → Restore.

**Orphan recovery:** `GET /api/map-data` `archivedGoals` now includes goals where `archived: true` **or** `status: ABANDONED`, so previously abandoned pursuits surface in the archived list. Restore sets `archived: false` and resets `status` to `ACTIVE` when the row was `ABANDONED`.

**Retained (safety nets):** Prisma `ABANDONED` enum value; `excludeAbandoned` in `formatMapContext` and map-data active `goals` query; mobile `isMapSurfacePursuit` ABANDONED filter. No migration, no new removal mechanism.

## 2026-06-11 — Layered context, Context section, status split

**Layered AI context:** `formatMapContext` / new `formatPursuitContext` pass theme, section, title, status, deadline, significance, icon, shortLabel, milestones, description, hub marks, and sibling pursuits to Story, Insights, Stream extract/enrich, icon assignment, milestone suggest, and context-questions.

**Context section (mobile):** Pursuit detail **Context** replaces “Heard first”. Empty state lazy-loads `POST /api/goals/[goalId]/context-questions` (conversational 2–3 questions). **Add context** / **Edit** opens paste/voice sheet → `POST /api/goals/[goalId]/apply-context` (description only, no milestones).

**Status:** `ON_HOLD` → **`PAUSED`**; new **`ABANDONED`** (off map, on Timeline). Long-press **Abandon pursuit** with inline confirm. `GET /api/branches?excludeAbandoned=1` for map clients; mobile also filters abandoned hexes client-side.

**Deferred (post-TestFlight):**
- Nudge query: `description IS NULL AND createdAt < 48h AND bloomStatus IN (ACTIVE, PAUSED)` → Need attention
- Onboarding proud-achievement tutorial (first map node is a win)
- Context prompt chips under questions

