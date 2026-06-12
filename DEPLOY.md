# Vercel deployment

Mobile consumes **`/api/*`** from this project. Desktop UI is on hold.

## Environments

| Vercel env | Git branch | Mobile EAS profile | API URL |
|------------|------------|----------------------|---------|
| **Production** | `main` (recommended) | `production` | `https://pathfinder-xi-rust.vercel.app` or custom domain |
| **Preview** | PR / feature branches | `preview` | Vercel preview URL per deployment |

### Preview vs production setup

1. **Vercel → Settings → Git:** Production Branch = `main`. Feature branches get Preview deployments only.
2. **Vercel → Settings → Environment Variables:** Scope secrets:
   - `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `GEMINI_API_KEY` → Production (and Preview only if preview uses a staging DB).
   - `CRON_SECRET` → Production (required for cron routes).
3. **EAS (Expo):** Project → Environment variables:
   - **production:** `EXPO_PUBLIC_API_BASE_URL` = production API URL.
   - **preview:** `EXPO_PUBLIC_API_BASE_URL` = a stable preview/staging URL (not production).
4. **`eas.json`:** `preview` uses EAS `environment: preview` — set the API URL in the Expo dashboard, not in git.

Never point EAS **preview** builds at production if you are testing schema migrations.

## Custom API domain (recommended)

1. Vercel → Project → Settings → Domains → add `api.yourdomain.com`.
2. Update `EXPO_PUBLIC_API_BASE_URL` in EAS production (and `.env.example`).
3. Set Vercel **Production** `NEXTAUTH_URL` to the same origin.

## Region

`vercel.json` pins functions to **`icn1`** (Seoul) to match Supabase `ap-northeast-2`.

## Build

`npm run build` runs `prisma migrate deploy && next build`. Migrations apply on each production deploy.

## Cron jobs

Configured in `vercel.json`:

| Schedule | Route | Purpose |
|----------|-------|---------|
| Daily 03:00 UTC | `/api/cron/cleanup-stream-runs` | Delete expired pending `StreamRun` rows |
| Weekly Sun 04:00 UTC | `/api/cron/map-health` | Map data-quality summary JSON |

Set **`CRON_SECRET`** in Vercel (Production). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.

## Health & smoke

- **Uptime:** monitor `GET /api/health` (no auth). Expect `{ ok: true, db: "up" }`.
- **CI:** `.github/workflows/api-smoke.yml` on push to `main` + manual `workflow_dispatch`.
- **Secrets (GitHub repo `pathfinder`):** `SMOKE_EMAIL`, `SMOKE_PASSWORD`.
- **Local:** `SMOKE_BASE_URL=https://… npm run smoke-test`

## Deployment protection

Enable **Vercel → Deployment Protection** on Production before TestFlight / public release.
