> **Workspace canon:** read [`docs/current/ALMANAC-PRODUCT-CANON.md`](../docs/current/ALMANAC-PRODUCT-CANON.md), [`docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md`](../docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md) and the root [`AGENTS.md`](../AGENTS.md) first. The user-facing durable unit is **Subject**; persistence temporarily remains `AlmanacPlace`. Almanac is not an Atlas or map. No migration is authorised merely to rename compatibility fields.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Almanac API (`pathfinder/` repo)

**Product name:** **Almanac** (mobile display name). This repo deploys **Next.js `/api/*`** on Vercel for the Expo client in `pathfinder-mobile/`.

**Workspace map** (workspace-external — these `../` files exist only in the full workspace checkout, not in this repo): [`../README.md`](../README.md) · **Git:** [`../GIT-WORKFLOW.md`](../GIT-WORKFLOW.md)

**Read first** (workspace-external):
[`../docs/current/ALMANAC-PRODUCT-CANON.md`](../docs/current/ALMANAC-PRODUCT-CANON.md) ·
[`../docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md`](../docs/current/ALMANAC-SUBJECT-HISTORY-EXPERIENCE.md) ·
[`../docs/current/ALMANAC-MEMORY-INTEGRITY-SPEC.md`](../docs/current/ALMANAC-MEMORY-INTEGRITY-SPEC.md).
Files in `docs/history/` and `docs/archive/` are evidence only, never current
direction.

**Mobile UI copy:** [`../pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) (workspace-external) — user-facing **Subject**, not Place/chapter/pursuit.

**Legacy persistence vocabulary:** [`GLOSSARY.md`](./GLOSSARY.md) ·
[`ONTOLOGY.md`](./ONTOLOGY.md). Their Goal/Theme/Chapter ontology documents
compatibility data only; it does not define current Almanac.

**Desktop web UI:** **Removed** — see [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md). `src/components/tree/` is deleted; do not recreate desktop map UI unless explicitly asked.

## Active surfaces

| Area | Path |
|------|------|
| API routes | `src/app/api/` |
| Domain + AI | `src/lib/` |
| Database | `prisma/` |
| Auth pages | `src/app/login/`, `src/app/reset-password/` |
| Web landing | `src/components/MobileWebLanding.tsx` |

## Legacy domain words (compatibility only)

The table below documents V1 persistence that may still exist during removal.
It is not current product vocabulary. The live new-core service is
`src/lib/almanac/` and `src/app/api/almanac/`; its `Place`, `atlas` and `slot`
names are compatibility wire/storage terms.

| UI (Almanac mobile) | Persistence |
|---------------------|-------------|
| theme | `themeId` / `LifeAreaId` |
| category | `categoryId` (Prisma `ThemeCategory`) |
| chapter | `Goal` (code/API word: **pursuit**; JSON may still say `pursuits`) |
| status | `Goal.status` (SQL column `status`; `bloomStatus` renamed away 2026-06-12) |

**Retired on mobile:** Stream UI, marks UI, hub/track user copy, desktop tree map.

## Dev commands

```powershell
npm install
npm run dev
npx prisma migrate dev
npm test
```

Legacy taxonomy and Reflect maintenance is not current Almanac work. Do not run
old backfills or revive removed prompt-version paths unless the user explicitly
requests V1 maintenance.

**Deploy:** [`DEPLOY.md`](./DEPLOY.md)

## Cursor Cloud specific instructions

API-only Next.js backend. No browser UI to exercise the product — test via HTTP against the dev server.

**Local services (already provisioned in the VM snapshot):**
- **PostgreSQL 16** (local, not Supabase). DB `pathfinder`, role `postgres`/`postgres`. It does **not** auto-start on boot — run `sudo pg_ctlcluster 16 main start` at the start of a session (check with `sudo pg_ctlcluster 16 main status`).
- **`.env.local`** (gitignored, present in snapshot) points `DATABASE_URL`/`DIRECT_URL` at local Postgres, sets `NEXTAUTH_SECRET`, and uses `AI_FAKE_PROVIDER="1"` so AI routes return deterministic canned JSON with **no** `GEMINI_API_KEY` / network. To exercise real Gemini, set `GEMINI_API_KEY` and remove `AI_FAKE_PROVIDER`. `/api/health` reporting `"ai":"missing"` is expected under the fake provider (it only checks for a Gemini key).

**Run / verify:**
- Dev server: `npm run dev` → http://localhost:3001. Liveness: `GET /api/health` (public; expect `"db":"up"`).
- After pulling new commits, apply any new migrations with `npx prisma migrate deploy` (avoid `migrate dev` — it can prompt). Standard commands are in the Dev commands section above.

**Auth for API testing:** all `/api/*` except `/api/auth/*` and `/api/health` require auth. Get a session JWT from `POST /api/auth/mobile-register` (or `/api/auth/mobile-login`) and send it as `Authorization: Bearer <token>`; middleware forwards it as the NextAuth session cookie. Registration auto-seeds the user's taxonomy. Fetch category ids from `GET /api/map-data` (`categories[]`); create a chapter/pursuit with `POST /api/goals` (needs a `categoryId`). `GET /api/goals` is retired (410) — read via `GET /api/map-data`.
