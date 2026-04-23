# Backlog — typing & ESLint (deferred)

Items logged for later; not in scope for the current ship window.

## Prisma seed typing

- **File:** `prisma/seed.ts`
- **Goal:** Replace `any` / `(prisma as any)` with proper types (e.g. Prisma-generated types for `LifeMapNode`, typed `upsert` input) so `@typescript-eslint/no-explicit-any` passes without suppressions.

## Onboarding complete API payload

- **File:** `src/app/api/onboarding/complete/route.ts`
- **Goal:** Remove the `as any` on the Prisma `update` payload (around the profile / life-wheel merge) and align with the generated Prisma `UserUpdateInput` (or equivalent) so the update is fully typed.

## ESLint: `any` and related rules (sweep)

Address `@typescript-eslint/no-explicit-any` and any follow-on typing in:

- `src/screens/Timeline.tsx`
- `src/app/finance-tracker/page.tsx`
- `src/components/PerfMonitor.tsx` (also fix `react-hooks/purity` and `react-hooks/refs` where applicable)
- `src/components/dashboard/life-wheel-launcher.tsx` (`react-hooks/refs` / ref access during render)
- `src/components/dev/DevHealthMonitor.tsx` (conditional hooks + ref-in-render rules)

Run `npm run lint` after each cluster of fixes to confirm error counts drop.
