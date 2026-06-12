# Desktop web UI — on hold

The Next.js app in this repo still **deploys to Vercel** and serves **`/api/*`** for the mobile client. The **interactive tree map UI is not being built forward.**

**Production web:** `/` is a mobile-only landing page. Legacy desktop routes (`/tree`, `/dashboard`, etc.) redirect to `/`. Local `npm run dev` still exposes desktop routes for reference.

## Do not edit unless explicitly asked

| Area | Path |
|------|------|
| Tree map components | `src/components/tree/` |
| Tree panels / rail | `src/components/tree/tree-panel.tsx`, related modals |
| Tree dev previews | `src/app/dev/` (hub panel preview, etc.) |
| Tree-first home | Routes that default to `/tree` after onboarding |

## Safe to edit (mobile depends on these)

| Area | Path |
|------|------|
| API routes | `src/app/api/` |
| Domain logic | `src/lib/` (taxonomy, Stream, branches, goals, marks) |
| Database | `prisma/` |
| Auth | `src/lib/auth.ts`, `src/app/api/auth/` |

## Mobile client

`pathfinder-mobile/` — Expo SDK 54, primary product surface.

## Future structural changes

See [docs/RENAME-MILESTONE.md](docs/RENAME-MILESTONE.md) before renaming this folder or deleting tree code.
