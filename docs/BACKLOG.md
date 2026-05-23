# Backlog — typing & ESLint (deferred)

Items logged for later; not in scope for the current ship window.

## Product backlog

- **Global Capture / Bark (post-Stream-stability):** Add global "say anything" capture after theme Stream is stable. Theme Stream should first preserve out-of-theme items as ambiguous so the later global route can build on per-item `themeId` + `hubId` assignment.
- **Profile Memory layer (post-Stream-stability):** Add a private, editable Profile Memory extraction lane to `StreamSession.summaryJson` for small reviewable insights that improve Stream routing and personalisation without becoming tree nodes.

## Onboarding complete API payload

- **File:** `src/app/api/onboarding/complete/route.ts`
- **Goal:** Remove the `as any` on the Prisma `update` payload (around the profile / life-wheel merge) and align with the generated Prisma `UserUpdateInput` (or equivalent) so the update is fully typed.

## ESLint: `any` and related rules (sweep)

Address `@typescript-eslint/no-explicit-any` and any follow-on typing in:

- `src/app/finance-tracker/page.tsx`
- `src/components/PerfMonitor.tsx` (also fix `react-hooks/purity` and `react-hooks/refs` where applicable)
- `src/components/dashboard/life-wheel-launcher.tsx` (`react-hooks/refs` / ref access during render)
- `src/components/dev/DevHealthMonitor.tsx` (conditional hooks + ref-in-render rules)

Run `npm run lint` after each cluster of fixes to confirm error counts drop.
