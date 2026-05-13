# Pathfinder — project brief

**Pathfinder** is a personal **life-map** web app: one place to see how the main areas of your life connect, log meaningful goals over time, and plan structured roadmaps without losing the wider picture.

## Core Product Vision

Pathfinder's founding insight: most people are already using AI to dump their thoughts — fears, plans, goals, anxieties — but nothing comes out the other side. The conversation ends and nothing changes.

Pathfinder gives that dump somewhere to land.

A user speaks or types freely — messy, non-linear, emotional. AI extracts meaning, structure, and intent. The output doesn't sit in a chat history. It becomes milestones on a branch. Timeline notes on the tree. Part of the permanent visual record of a life.

This is the product in one sentence:
Pathfinder turns the way people already think — messy, non-linear, emotional — into a structured map of their life.

## Stream (brain dump feature)

Name: Stream
Trigger: "Stream" button on each goal panel
Interaction: Single open input — text or voice. No questions, no prompts. Just space to think out loud.
AI extracts: refined goal title, motivations, blockers, suggested milestones, 2-3 sentence narrative summary.
Output: presented back as "Here's what I heard" — user confirms, adjusts, or discards each piece.
What's confirmed writes back to the goal: milestones added to hex, narrative saved, tree updated.

Why it's different: the output isn't a summary in a notes field. It changes the shape of the tree. The map evolves from what you said.

Why it's new: no product combines unstructured brain dump → AI extraction → enrichment of a visual life map. The tree responds to your thinking. That feedback loop is genuinely novel.

## What it does

- **Tree view (`/tree`)** — The default home in production. An interactive SVG “life tree” with five **themes** (finance, work, becoming, people, health), **hubs** (named tracks under each theme), and **timeline notes** (dated items on the hub timeline: milestones, setbacks, decisions, and so on—distinct from roadmap milestones on a goal). You can pan, zoom, toggle themes, and open detail panels.
- **Roadmap & goals** — Structured goals with milestones and subtasks; per-goal roadmap views.
- **Next steps** — A focused surface for what to do next.
- **Dashboard** — Overview of goals and entry points into roadmaps.
- **Finance tracker** — Separate tracking surface linked from the product.
- **Onboarding & auth** — Email/password (and session) flow; onboarding gates the main experience until completed.

Data is **per user**: goals and timeline notes belong to **hubs** (root `Branch` rows under a **theme**; legacy column name `limbId` on rows stores the theme id). Roadmap **goals** can **evolve** from prior goals (`parentGoalId`) via the fork API. Optional AI features use providers such as Groq where configured.

## Technical stack

| Layer | Choice |
|--------|--------|
| App framework | **Next.js** (App Router), **React** |
| Database | **SQLite** via **Prisma** |
| Auth | **NextAuth** with Prisma adapter |
| Styling | **Tailwind CSS** (and substantial inline layout for the tree canvas) |

The main application code lives in this **`pathfinder/`** directory (`src/app`, `src/components`, `src/lib`, `prisma`).

## Who it’s for

Individuals who want a **private, holistic** view of their story and priorities—not a single-purpose habit or finance app, but a map that keeps every major branch in sight.

## Further reading

- **Vision and principles:** [`PROJECT.md`](./PROJECT.md)
- **Run locally:** [`README.md`](./README.md) (dev server and setup)
