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
