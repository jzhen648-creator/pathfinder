# Almanac API — deploy checklist

## Before each production deploy

1. **Reflect prompt changes** — if you ship material reflect/enrich prompt or post-gen gate changes, bump `REFLECT_PROMPT_VERSION` in `src/lib/insights/reflect-prompt-version.ts` in the **same commit** so existing `InsightCache` rows mark stale and regen on next app open.

2. **Env vars (Vercel → Production)** — values must be the string `true`, not empty:
   - `USE_REFLECT_CALL=true`
   - `AI_READING_DELIVERY_BYPASS=true` (QA / pre-TestFlight)
   - `GEMINI_API_KEY` set
   - Optional free-tier QA: `GEMINI_MODEL=gemini-2.5-flash-lite` (higher RPM/RPD than `gemini-2.5-flash`)

3. **Redeploy** after any env change (env does not apply to running lambdas until redeploy).

4. **Verify deployment SHA** — Vercel → Deployments → latest Ready → commit matches `pathfinder` repo HEAD.

5. **Manual live check** (not CI):
   ```powershell
   cd pathfinder
   npm run verify:prod
   ```

6. **Optional reflect smoke** (one ai-sync on production — costs Gemini calls):
   ```powershell
   $env:QA_SMOKE_EMAIL="jzhen648+pathfinder@gmail.com"
   $env:QA_SMOKE_PASSWORD="<password>"
   npm run verify:prod:reflect
   ```
   Expect: `reflect: true` on `/api/health`; ai-sync `reflectCall: true`; 1–4 calls.

7. **Device reflect retest** — one Insights pull-to-refresh on phone:
   - Network: **1** `POST /api/map/ai-sync` (small dirty set)
   - Footer: `Reflect sync · 1 Gemini call on last update · 0 panels left`
   - Vercel logs: `reflectCall: true`, `aiCallsCompleted: 1`

Public routes (no auth): `GET /api/health`, `GET /privacy`.

## Mobile local dev

Copy `pathfinder-mobile/.env.example` → `.env.local` and set:
- `EXPO_PUBLIC_USE_REFLECT_CALL=true`

After env changes: `npx expo start --clear`.
