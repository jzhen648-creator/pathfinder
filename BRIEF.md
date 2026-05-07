# Pathfinder — project brief

**Pathfinder** is a personal **life-map** web app: one place to see how the main areas of your life connect, log meaningful moments over time, and plan goals without losing the wider picture.

## What it does

- **Tree view (`/tree`)** — The default home in production. An interactive SVG “life tree” with five areas (finance, work, becoming, people, health), **branches** (threads of narrative), and **marks** (dated moments: milestones, setbacks, decisions, and so on). You can pan, zoom, toggle areas, and open detail panels.
- **Roadmap & goals** — Structured goals with milestones and subtasks; per-goal roadmap views.
- **Next steps** — A focused surface for what to do next.
- **Classic life map** — An earlier canvas-style map for exploration and editing.
- **Dashboard** — Overview of goals and entry points into roadmaps.
- **Finance tracker** — Separate tracking surface linked from the product.
- **Onboarding & auth** — Email/password (and session) flow; onboarding gates the main experience until completed.

Data is **per user**: branches and marks belong to life **limbs**; the model supports forks (child branches) and turning points. Optional AI features use providers such as Groq where configured.

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
