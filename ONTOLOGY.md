# Pathfinder ontology

Canonical relationships between persisted entities and derived UI concepts. Naming: [`GLOSSARY.md`](./GLOSSARY.md) (persistence) · [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) (UI copy).

## Product surfaces (mobile, 2026-06)

| Surface | Holds truth? | Authoritative for | User can edit? |
|---------|--------------|-------------------|----------------|
| **Map** | Yes | Pursuits + placement + progress | Yes (utility bar **+**, long-press **Build here**, sheet) |
| **Settings** | Yes | Profile, account, archived pursuits | Yes |
| **Insights** (tab) | No (regenerated) | Theme insight cards, cross-theme links | No — pull to refresh syncs |
| **Insight** (inline) | No (regenerated) | Theme/pursuit prose in map sheet | No |
| **Timeline** (tab) | No (derived) | Chronological pursuit record | No |
| **Map status filter** | No (derived) | Spatial status highlight on hexes | No |

- **One store.** Map = structured truth: **pursuits** on the hex canvas. Settings holds profile fields used by Insights sync.
- **Views at three scopes.** Insights tab = collated **theme insight cards**. **Insight** = inline AI block in theme/pursuit map sheet. Timeline = pursuit-grouped spine (upcoming + completed). Map **Filter** = status highlight on hexes.
- **One input verb.** Map utility bar **+** or long-press **Build here** creates pursuits. No marks UI on mobile.

**Decision test (check every new feature):**

1. Can the user edit it? → map store (pursuits) or settings.
2. Does it regenerate from data? → view (Insights tab, panel Insight, or Timeline).
3. Nothing originates in a view.

**Retired on mobile (2026-06):** marks UI, Stream, whole-map Reading (`seasonRead`), modal theme/pursuit routes, Profile tab, pursuit nesting, Story tab name.

## Derived backend (not a user surface)

| Layer | Implementation | Notes |
|-------|----------------|-------|
| **Reading compiler** | `compile-reading-packet.ts` | Deterministic facts from pursuit fields before Gemini. See [`docs/READING-COMPILER.md`](./docs/READING-COMPILER.md). |
| **Dirty ledger** | `AiReadingDirtyItem` | Tracks entities changed since last successful sync. |

## Core entities

| Concept | Implementation | Notes |
|--------|----------------|-------|
| **Theme** | Fixed ids (`finance`, `work`, `becoming`, `pleasures`, `people`, `health`); DB `themeId`; code type `LifeAreaId` | Catalog slice of life — not a table. |
| **Category** | Prisma `ThemeCategory` root row; FK `categoryId` on `Goal` | Named slot under a theme. **Shown in mobile UI.** Legacy: hub, track, section, `branchId`. |
| **Goal** | Prisma `Goal` | User word **pursuit** — no subtypes. Legacy `goalType`, `moment` / `event` rows. |
| **Milestone** | Prisma `Milestone` | Phase within one goal only. |
| **Mark** | Prisma `Mark` | **Schema-only on mobile** — no UI. Desktop / legacy data. |
| **Soft delete** | `Goal.archived` | Hidden from map; restore via Settings. |
| **Goal evolution (legacy data)** | `Goal.parentGoalId` | Fork API removed — mobile uses flat peers only. |

## Status (pursuit lifecycle)

User word: **Status** — Active · Maintaining · Paused · Complete.

Persisted: `Goal.status` (SQL `bloomStatus`). Legacy bloom values (`BUD`, `GROWING`, `BLOOMED`, `ENDED`) normalized at read. Rules: `goal-status-lifecycle.ts`.

**Do not** assign lifecycle from graph shape (successor count, nesting). Status is user- or Stream-set, not derived from milestones alone.

## Deprecated vocabulary

- **`thread*`** — legacy geometry / taxonomy seed names, not continuations. Do not introduce new `thread*` domain identifiers.
- **hub / track / section** — legacy synonyms for **category**. Desktop only.
- **bloom** — legacy lifecycle word; user-facing **status** only.
- **Stream** — backend wire only; retired as product surface (Jun 2026).

## Dangerous collisions (for authors & AI)

| Term | Ambiguity |
|------|-----------|
| **Branch** | Prisma SQL table name vs generic English. Mobile UI: **category**. Code: **ThemeCategory**. |
| **Fork** | SVG layout fork vs removed goal-evolution API vs legacy split row. Qualify: **layout fork**, **legacy split row**. |
| **Theme** vs **`LifeAreaId` / `limbId`** | Same ids — **theme** is the product word. |
| **Reading** vs **Insight** | **Reading** retired as user word. Backend **reading compiler** is internal. User word: **Insight**. |

## Terminology policy

**Preferred nouns (mobile UI):** theme · category · pursuit · status · insight

**Forbidden in new mobile UI:** hub, track, branch, thread, bloom, mark, Reading, Stream, project, identity, practice

**Desktop-only (on hold):** tree view, edit-map reorganize, mark hover cards, branch-line sequence — see [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md).

## References

- Historical UX audit: [`docs/archive/UX-TERMINOLOGY-AUDIT.md`](./docs/archive/UX-TERMINOLOGY-AUDIT.md)
- Stabilization phase: [`docs/STABILIZATION.md`](./docs/STABILIZATION.md)
- Milestone projection (desktop hex): `src/components/tree/milestone-tree-projection.ts`
- Status lifecycle: `src/lib/goal-status-lifecycle.ts`
