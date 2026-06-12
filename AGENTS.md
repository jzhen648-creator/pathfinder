<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Pathfinder domain language

**Active client:** `pathfinder-mobile/` — see workspace [`START-HERE.md`](../START-HERE.md). **Stream behaviour:** [`docs/STREAM.md`](./docs/STREAM.md). **Doc index:** [`docs/README.md`](./docs/README.md). **What shipped:** [`CHANGELOG.md`](./CHANGELOG.md) + [`DECISIONS.md`](./DECISIONS.md). Historical vision: [`docs/archive/VISION.md`](./docs/archive/VISION.md). Desktop UI frozen: [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md).

Canonical product words: **theme** (outer pillar — same ids as `LifeAreaId` / `limbId`), **pursuit** (`Goal`), **mark** (`Mark`). **Taxonomy category** (`Branch`, `branchId`; legacy hub/track) stays in DB and API for routing — **hidden from mobile UI** since 2026-06. Mobile UI copy: [`pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md). Persistence: [`GLOSSARY.md`](./GLOSSARY.md), [`ONTOLOGY.md`](./ONTOLOGY.md).

Before changing tree, goals, branches, bloom, or continuation behavior, read [`ONTOLOGY.md`](./ONTOLOGY.md) and [`GLOSSARY.md`](./GLOSSARY.md). Do not extend desktop tree UI unless asked — [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md).

**Stabilization / QA phase:** [`docs/STABILIZATION.md`](./docs/STABILIZATION.md) — dogfood phase after milestone convergence (relational milestones only; freeze guidance; QA checklist). Prefer categorizing fixes there before broad refactors.

**Milestone truth (implementation):** relational `Milestone` / `Subtask` rows are the **only** milestone store (`Goal.treeMilestones` JSON column removed). Hex dots: `src/components/tree/milestone-tree-projection.ts`; panel predicates: `src/components/tree/goal-milestone-predicates.ts`. Bloom: `src/lib/goal-bloom-lifecycle.ts` + `recomputeGoalBloomStatus`.

**Do not** introduce new `thread*` domain identifiers or use **thread** in new user-facing copy for goal continuation (legacy code may still say “thread” for older hub/geometry identifiers).

**Tree UX (May 2026):** Product summary in [`BRIEF.md`](./BRIEF.md). Stream from theme/hub panels only. Marks = hub-level + `MarkHoverCard`. Edit map: `tree-edit-map-overlay.tsx`, `POST /api/goals/[goalId]/reorganize`, `lib/goal-reorganize.ts`. Do not re-add wide limb polygon/stem click targets without an explicit product decision.

## Cursor Cloud specific instructions

This repo is the **Next.js backend + (frozen) desktop web UI** for Pathfinder. Standard commands live in `package.json` (`dev`, `lint`, `build`, `test:e2e`); only the non-obvious caveats are noted here.

**Database — local PostgreSQL (not SQLite).** Despite `.cursorrules`/`BRIEF.md` mentioning SQLite, `prisma/schema.prisma` is **PostgreSQL** and `.env.example`'s `file:./dev.db` URL is stale. The update script installs npm deps only; the Postgres server is provisioned in the VM snapshot. On a fresh session it may not be running — start it with `sudo pg_ctlcluster 16 main start` (or `sudo service postgresql start`) before running the app or migrations. Local DB: database `pathfinder`, user/pass `postgres`/`postgres`.

**`.env.local` is required and git-ignored.** `prisma.config.ts` loads it with `override:true`, and Next reads it too. It holds `DATABASE_URL`/`DIRECT_URL` (both point at local Postgres), `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3001`, and `AI_PROVIDER`. It persists in the snapshot; if missing, recreate it from `.env.example` but with a real Postgres `DATABASE_URL` **and** `DIRECT_URL` (schema requires both). `npm install`'s `postinstall` runs `prisma generate`, which throws if `DATABASE_URL` is unset.

**First-time / reset DB setup (not in update script):** `npx prisma migrate deploy` then `npx prisma db seed`. Seed creates test accounts, all with password `pathfinder123` (e.g. `test-empty@pathfinder.com`, `test-full@pathfinder.com`). The "Dev login" button uses `jzhen648@gmail.com` which is **not** seeded — sign in with a seeded account instead.

**Run:** `npm run dev` serves API + web on **port 3001** (`http://localhost:3001`). Root redirects to `/login`; the desktop life-map is `/tree`. In development, AI roadmap generation on goal create is gated off unless `ENABLE_AI_ROADMAPS_IN_DEV=true`.

**AI features need a provider key.** Stream/Story/Insights and the GUI "+ ADD" quick-add pursuit call the LLM and fail with `GEMINI_API_KEY not configured` (or the active `AI_PROVIDER` key) when unset. The rest of the app works without it. The direct `POST /api/goals` endpoint does **not** require AI and is the reliable way to create a pursuit headlessly.

**Headless API testing:** `/api/*` is session-gated. Get a JWT from `POST /api/auth/mobile-login` ({email,password}) and send it as `Authorization: Bearer <jwt>`; middleware forwards it as the NextAuth session cookie. `GET /api/map-data` lazily syncs the taxonomy and creates the user's `ThemeCategory` rows (needed before `POST /api/goals`, whose `branchId` is a category id).

**Lint:** `npm run lint` reports pre-existing errors only in the standalone `Pathfinder Design/*.jsx` mockups (undefined components) — these are not part of the live `src/` app.
