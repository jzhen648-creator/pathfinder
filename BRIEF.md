# Pathfinder — project brief

**Pathfinder** is a personal **life-map** web app: one place to see how the main areas of your life connect, log meaningful **pursuits** over time, place **timeline notes** on hubs, and plan structured roadmaps without losing the wider picture.

## Core product vision

Most people already use AI to dump thoughts — fears, plans, goals, anxieties — but nothing durable comes out the other side. The conversation ends and nothing changes.

Pathfinder gives that dump somewhere to land.

A user speaks or types freely — messy, non-linear, emotional. AI extracts structure and intent. The output does not sit in chat history. It becomes **pursuits** (with milestones on the hex), **timeline notes** on hubs, and sometimes items that need a quick human decision on the map itself.

**In one sentence:** Pathfinder turns how people already think into a structured, visual map of their life.

## Stream (brain dump)

| | |
|--|--|
| **Entry** | **Open Stream** on the theme, hub, or pursuit panel (one button per panel). |
| **Input** | Open text or voice — no interview, no mandatory prompts. |
| **Extract** | Pursuits, timeline notes, milestones, status updates on existing pursuits, and **ambiguous** items the model is unsure about. |
| **Confirm** | Card queue for structured items; user confirms or skips each piece before commit. |
| **Ambiguous** | Committed immediately as **unresolved** timeline notes on the tree (dashed marker); user resolves **Done / In progress / Not started** on the map or from the hub panel — not another confirmation card. |
| **Why it matters** | Confirmed items change the **map** (new nodes, order, bloom status), not a notes field buried in settings. |

Requires `GEMINI_API_KEY` for extract/enrich. Detail: [`docs/STREAM.md`](./docs/STREAM.md), [`DECISIONS.md`](./DECISIONS.md), [`CHANGELOG.md`](./CHANGELOG.md) (2026-05-16 / 2026-05-19).

## Tree map (`/tree`) — primary home

Default surface after onboarding. Interactive SVG with five **themes** and **17 system hubs** (taxonomy `2026-05-19-v6` in `src/lib/taxonomy.ts`).

**Navigation**

- Pan and zoom on open canvas; click empty map to dismiss panels.
- **Theme** opens from the gateway medallion / theme label (not from huge invisible limb shapes).
- **Hub** opens from the domain-hub hit area on a spoke.
- **Pursuit** opens from the hex node; **timeline note** opens from the amber diamond (hover card + detail in the left rail when a mark is active).

**Panels (May 2026)**

- **Theme** — one-line about, hub list, **Open Stream** (theme Stream).
- **Hub** — catalog copy, marks list, pursuits (active first; on hold/complete behind “show more”), hub Stream.
- **Pursuit** — status (**Active / On hold / Complete**), milestones, roadmap depth; no “add mark on pursuit” (marks are hub-level only).

**Edit map**

- Toolbar **Edit map** (off during an active Stream session).
- Drag pursuits: move to another **hub**, nest under another **pursuit**, or reorder on the branch line.
- Pan disabled while editing; small drag threshold so tap still opens the pursuit panel.

**Focus mode** (flagged): dim non-focused themes via the **theme icon** — not by clicking limb backdrop polygons or branch labels.

## What else it does

- **Roadmap & goals** — Structured pursuits with relational milestones and subtasks.
- **Next steps** — Focused “what to do next” surface.
- **Dashboard** — Overview and entry into roadmaps.
- **Finance tracker** — Separate tracking surface.
- **Onboarding & auth** — Email/password + session; onboarding picks themes and activates hubs.

**Data model (short):** Pursuits and timeline notes attach to **hubs** (`Branch` rows under a **theme**; legacy column `limbId` = theme id). `Goal.parentGoalId` chains are **legacy layout only** — new pursuits come from Stream, not Evolve (removed). Soft-delete via `archived` on goals/marks. Branch order uses shared `sequencePosition` + insert anchors (`src/lib/branch-sequence.ts`).

## Technical stack

| Layer | Choice |
|--------|--------|
| App framework | **Next.js** (App Router), **React** |
| Database | **SQLite** via **Prisma** |
| Auth | **NextAuth** with Prisma adapter |
| Styling | **Tailwind CSS** + substantial inline layout for the tree canvas |

Code lives in **`pathfinder/`** (`src/app`, `src/components`, `src/lib`, `prisma`).

## Who it’s for

Individuals who want a **private, holistic** view of their story and priorities — not a single-purpose habit or finance app, but a map that keeps every major branch in sight.

## Further reading

| Doc | Use for |
|-----|---------|
| [`VISION.md`](./VISION.md) | Product **north star** (why we exist). |
| [`docs/STREAM.md`](./docs/STREAM.md) | Stream feature spec. |
| [`docs/MOBILE-VISION.md`](./docs/MOBILE-VISION.md) | Future mobile direction (not in build). |
| [`docs/README.md`](./docs/README.md) | Full docs index. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Dated **what shipped** (start with 2026-05-19). |
| [`DECISIONS.md`](./DECISIONS.md) | **Why** — sequence grammar, Stream, taxonomy, focus/edit-map behaviour. |
| [`GLOSSARY.md`](./GLOSSARY.md) / [`ONTOLOGY.md`](./ONTOLOGY.md) | Terms and code↔product mapping. |
| [`docs/STABILIZATION.md`](./docs/STABILIZATION.md) | QA phase, milestone truth, dogfood checklist. |
| [`docs/architecture.md`](./docs/architecture.md) | Compressed system architecture. |
| [`PROJECT.md`](./PROJECT.md) | Deeper philosophy (hydraulic effect, etc.). |
| [`README.md`](./README.md) | Run locally. |
