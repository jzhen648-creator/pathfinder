# Desktop web UI — removed

The Next.js app in this repo **deploys to Vercel** and serves **`/api/*`** for the mobile client. The interactive tree map and desktop Stream UI have been **removed** (see commit `chore: remove desktop tree UI — mobile-only going forward`).

**Production web:** `/` is a mobile-only landing page. Legacy desktop routes (`/tree`, `/dashboard`, etc.) redirect to `/`.

## Active surfaces

| Area | Path |
|------|------|
| API routes | `src/app/api/` |
| Domain logic | `src/lib/` (taxonomy, goals, AI reflect/insights) |
| Database | `prisma/` |
| Auth pages | `src/app/login/`, `src/app/reset-password/` |
| Web landing | `src/components/MobileWebLanding.tsx`, `src/lib/web-landing.ts` |

## Mobile client

`pathfinder-mobile/` — Expo SDK 54, primary product surface.

## Dev tooling

| Script | Purpose |
|--------|---------|
| `npm run fresh-start:mobile` | Wipe map data; reset mobile onboarding for dev account |
| `npm run smoke-test` | Sequential API route smoke test |
| `npx prisma db seed` | Empty test accounts (no map fixtures) |

*(Removed 2026-07-13: `npm run dogfood:stream` — script and `POST /api/stream/extract` no longer exist.)*
