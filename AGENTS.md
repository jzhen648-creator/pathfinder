<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Almanac API (`pathfinder/` repo)

**Product name:** **Almanac** (mobile display name). This repo deploys **Next.js `/api/*`** on Vercel for the Expo client in `pathfinder-mobile/`.

**Workspace map** (workspace-external — these `../` files exist only in the full workspace checkout, not in this repo): [`../START-HERE.md`](../START-HERE.md) · **Git:** [`../GIT-WORKFLOW.md`](../GIT-WORKFLOW.md)

**Read first** (workspace-external): [`../PATHFINDER-DECISIONS-LOG.md`](../PATHFINDER-DECISIONS-LOG.md) · [`../PATHFINDER-CORRECTED-FACTS.md`](../PATHFINDER-CORRECTED-FACTS.md) · [`../PATHFINDER-QA-PLAN.md`](../PATHFINDER-QA-PLAN.md) — in-repo fallback: [`DECISIONS.md`](./DECISIONS.md)

**Mobile UI copy:** [`../pathfinder-mobile/TERMINOLOGY.md`](../pathfinder-mobile/TERMINOLOGY.md) (workspace-external) — user-facing **chapter**, not pursuit.

**Persistence vocabulary:** [`GLOSSARY.md`](./GLOSSARY.md) · [`ONTOLOGY.md`](./ONTOLOGY.md)

**Desktop web UI:** **Removed** — see [`DESKTOP-ON-HOLD.md`](./DESKTOP-ON-HOLD.md). `src/components/tree/` is deleted; do not recreate desktop map UI unless explicitly asked.

## Active surfaces

| Area | Path |
|------|------|
| API routes | `src/app/api/` |
| Domain + AI | `src/lib/` |
| Database | `prisma/` |
| Auth pages | `src/app/login/`, `src/app/reset-password/` |
| Web landing | `src/components/MobileWebLanding.tsx` |

## Domain words (API / persistence)

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

**After taxonomy changes:** `npm run backfill:taxonomy` (see workspace `START-HERE.md`).

**Reflect prompt deploy:** bump `REFLECT_PROMPT_VERSION` in `src/lib/insights/reflect-prompt-version.ts` when shipping material reflect/enrich prompt or post-gen gate changes (same commit).

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
