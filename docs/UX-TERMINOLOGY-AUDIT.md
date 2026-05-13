# Phase 2 — User-facing terminology audit & UX semantics

Companion to [`ONTOLOGY.md`](../ONTOLOGY.md) and [`GLOSSARY.md`](../GLOSSARY.md). Updated as copy changes land.

## 1. User-visible inventory (thread / fork / hierarchy-style wording)

### UI labels

| Location | Current | Meaning in product | Suggested direction |
|----------|---------|--------------------|---------------------|
| [`create-mark-modal.tsx`](../src/components/roadmap/create-mark-modal.tsx) | Label **Thread** | Taxonomy **branch line** (`Branch`) | **Branch line** |
| [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx) (moment rail) | **Branch this goal into a new thread** | Creates child **`Branch`** (split), not goal continuation | **Start a new branch line from here** |
| [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx) | Fallback **Thread** (moment header) | Missing branch title | **Branch line** |
| [`tree-alternate-views.tsx`](../src/components/tree/tree-alternate-views.tsx) | AI reflection: **This thread shows…** | Timeline along one **`DomainHubData`** (root branch) | **This branch line shows…** or **This story along the branch shows…** |
| [`DevPanel.tsx`](../src/components/dev/DevPanel.tsx) | **Threads (Raw)** | Loaded `Branch` rows | **Branches (raw)** |

### Buttons / actions

| Location | Current | Actual behavior | Suggested direction |
|----------|---------|-----------------|---------------------|
| [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx) | **Create child thread** | `POST` branch split from moment | **Create branch line** |
| *(none exposed)* | “Fork goal” button | `POST /api/goals/[id]/fork` exists but **no dedicated goal-panel CTA** surfaced in audit | Future: **Continue this goal** / **Start next related goal** |

### Tooltips / titles

| Location | Notes |
|----------|--------|
| [`tree-alternate-views.tsx`](../src/components/tree/tree-alternate-views.tsx) | Moment buttons use `title={moment.label…}` — no thread/fork issue. |

### Onboarding / empty states

| Location | Current | Suggested |
|----------|---------|-----------|
| [`create-mark-modal.tsx`](../src/components/roadmap/create-mark-modal.tsx) | Error: **Pick a thread…** | **Choose a branch line** (or **which branch** this mark belongs to) |
| [`create-mark-modal.tsx`](../src/components/roadmap/create-mark-modal.tsx) | **No threads in this area** | **No branch lines in this area yet** |

### Docs / product brief

| File | Issue |
|------|--------|
| [`BRIEF.md`](../BRIEF.md) | “branches (**threads** of narrative)”, “marks on the **thread**” — confounds taxonomy line with continuation |

### Dev / debug surfaces

| Location | Current | Note |
|----------|---------|------|
| [`DevPanel.tsx`](../src/components/dev/DevPanel.tsx) | **thread:** `{branch}` | Rename label to **branch line** for hover gap context |
| [`DevPanel.tsx`](../src/components/dev/DevPanel.tsx) | **Start/End of thread** | **Start/end of branch line** on stroke |
| [`tree-svg.tsx`](../src/components/tree/tree-svg.tsx) (element guide, dev labels) | **`thread · idx · type`** | **branchLine ·** — layout-only label, not a domain rename |

### Subgoal-style wording (watchlist)

| Location | Current | Risk |
|----------|---------|------|
| [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx) | Delete confirm: **branched goals** | Implies tree topology = branching variant of same goal; prefer **continuation** / **related goals** |
| [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx) | Moment copy **Branch this goal** | Moment is not a roadmap goal — consider **this moment** in a later pass |

---

## 2. Continuation UX analysis

**Current state**

- **Data:** `parentGoalId`, `forkedGoals`, `POST .../fork` implement continuations.
- **Tree:** `renderGoalsSubtree` draws **`childGoals`** in a **radial fan** from the parent node (`tree-render-goals-subtree.tsx`) — reads as **nested hierarchy** or “sub-nodes” even though data are **peers** linked longitudinally.
- **Panel:** Goal panel shows milestones/subtasks but **no dedicated “Continuations” section** listing successor titles or a primary CTA to **continue this goal** — users rarely see continuation language.

**Where hierarchy is implied**

- Visual: parent-centered spokes to children (depth-based layout).
- Copy: “branched goals” on delete suggests branch/fork metaphor tied to children.
- Absence of explicit “Next chapter” language leaves the visual metaphor unconstrained.

**Small wins without layout rewrites**

1. Goal panel: add a short line when `childGoals.length > 0`: e.g. **“Next related goals (continuations): …”** with titles (future micro-PR).
2. Prefer **Continue / next related goal** for any new API surface; avoid **fork** in user strings.
3. Moment **branch split** UI: always pair with **branch line** / **turning point**, never **thread**.

---

## 3. Tree visualization semantics

**How continuations render**

- Goals attach to **`branchLineGoalStation`** geometry along the catalog path; **continuations** reuse **goal subtree** rendering with edges from **hex bottom** (or center) to each child (`renderGoalsSubtree`).
- Multiple children form a **hub-and-spoke** pattern at increasing **depth** — similar to **org-chart decomposition**, not a linear “timeline of pursuits.”

**Risk**

- Users (and LLMs interpreting screenshots) infer **parent/child = breakdown**, not **evolution**.

**Low-risk visual tweaks (ideas only; not implemented in Phase 2)**

- Use a distinct **edge style** for continuation links vs hypothetical future “composition” edges (e.g. dashed **continuation** connector, or subtle **“→”** cue in element-guide-only mode).
- Prefer **horizontal offset along branch stroke** for successors (medium effort — defer).
- **Titles/tooltips** on edges: “Continues from …” (accessible text only — low effort).

---

## 4. Dangerous terminology hotspots (post–Phase 2)

**Likely to confuse Cursor/LLMs / contributors**

1. **`selectedThreadId` / `onSelectThread`** — prop names say “thread” for **branch line** selection.
2. **`threadIdx` / `threadFork` / `pickThreadMomentsForTree`** — geometry; **fork** collides with goal fork API.
3. **`threadType` / `branchThreadTitle`** — taxonomy seed field named thread.
4. **`THREAD_*` env vars** — public “thread” for toggles.
5. **`GoalFork` Prisma relation name** — sounds like nested fork, means continuation.

**Prioritize next (when doing Phase 3 renames)**

- User-visible strings first (mostly addressed in Phase 2 copy pass).
- Then **`selectedThreadId`** → `selectedBranchLineId` (touches tree shell only).
- Geometry identifiers last (biggest diff, lowest user value).

**Safe as legacy internal for now**

- `tree-svg.tsx` local variable `thread` holding **`DomainHubData`** (rename later with discipline).
- `THREAD_GLOBAL_SHORTEN` constants.

---

## 5. Future direction (analysis only)

| Topic | Recommendation | Migration risk |
|-------|----------------|----------------|
| Rename **`parentGoalId`** → `continuedFromGoalId` | Clearer semantics; high churn (Prisma, API, tree-data, clients) | **High** — planned migration with compat column or dual-write window |
| Rename **`POST .../fork`** → **`.../continue`** | Matches ontology; keep **fork** as 308 redirect | **Low–medium** — route alias + doc update |
| Rename **`GoalFork` relation** | Pure clarity win | **Medium** — Prisma relation rename + regenerate |

---

## 6. Wording replacements applied (Phase 2 PR)

See git history for [`create-mark-modal.tsx`](../src/components/roadmap/create-mark-modal.tsx), [`tree-panel.tsx`](../src/components/tree/tree-panel.tsx), [`tree-alternate-views.tsx`](../src/components/tree/tree-alternate-views.tsx), [`DevPanel.tsx`](../src/components/dev/DevPanel.tsx), [`BRIEF.md`](../BRIEF.md), [`tree-svg.tsx`](../src/components/tree/tree-svg.tsx) dev label text, [`tree-goal-visual.tsx`](../src/components/tree/tree-goal-visual.tsx) comments.
