<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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
