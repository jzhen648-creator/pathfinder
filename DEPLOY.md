# Pathfinder API — deploy checklist

## Before each production deploy

1. **Env vars (Vercel → Production)** — values must be the string `true`, not empty:
   - `USE_REFLECT_CALL=true`
   - `AI_READING_DELIVERY_BYPASS=true` (QA / pre-TestFlight)
   - `GEMINI_API_KEY` set

2. **Redeploy** after any env change (env does not apply to running lambdas until redeploy).

3. **Verify deployment SHA** — Vercel → Deployments → latest Ready → commit matches `pathfinder` repo HEAD.

4. **Manual live check** (one Gemini call, not CI):
   ```powershell
   cd pathfinder
   npm run test:live-gemini
   ```

5. **Device reflect retest** — one **Update AI reading** tap:
   - Network: **1** `POST /api/map/ai-sync`
   - Insights footer: `Reflect sync · 1 Gemini call · 0 panels left`
   - Vercel logs: `reflectCall: true`, `aiCallsCompleted: 1`

## Quota hygiene (if legacy digest suspected)

```powershell
cd pathfinder
npx tsx scripts/list-pending-stream-runs.ts
npx tsx scripts/cancel-pending-stream-runs.ts --email=YOUR_EMAIL
```

## Mobile local dev

Copy `pathfinder-mobile/.env.example` → `.env.local` and set:
- `EXPO_PUBLIC_USE_REFLECT_CALL=true`

After env changes: `npx expo start --clear`.
