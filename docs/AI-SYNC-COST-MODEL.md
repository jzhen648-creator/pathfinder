# AI sync cost model

**Status:** Active as of 2026-07-04. Phase 1 foreground sync; Phase 2 incremental routing; Phase 2.5 periodic full regen.

## What triggers a paid Gemini call

A sync (`POST /api/map/ai-sync`) costs **$0** when:

- Dirty ledger is empty **and** insight cache matches `mapVersion` / `memoryVersion` (no work needed).
- Delivery cadence gate blocks the sync (`deliveryBlocked: true`) — no Gemini calls.
- Background sync is waiting but user has not foregrounded the app (no HTTP request).

A sync costs **tokens** when reflect runs: `min(ceil(dirtyPursuits / 8), 4)` Gemini calls per HTTP request (batch size 8, max 4 calls).

## Sync triggers (Phase 1 + 2)

With `BACKGROUND_AI_SYNC_ENABLED = true`:

| Trigger | Calls per typical session |
|---------|---------------------------|
| App foreground after map edits | 0–1 sync (+ follow-ups if `morePending`) |
| Map edit (~60s debounce) | 0–1 incremental sync (dirty chapters only) |
| Pull-to-refresh (manual) | Same as above — `force: false` when background on |
| Periodic full (max ~1 / 7 days) | 1 full sync when ledger empty + cache fresh — see §36 |
| Idle browsing / reopen with fresh reading | **0** |

Built-in throttles still apply: 2h delivery cadence (unless `AI_READING_DELIVERY_BYPASS=true`), 12 successful calls/user/minute, single-flight per user.

## Token anatomy per reflect call

Input (accumulated in metrics):

- `systemPromptChars` — fixed reflect system prompt
- `userPromptChars` — includes `<map_context>` JSON (dominant on full refresh)
- `readingPacketChars` — compiled reading packet

Output:

- `reflectResponseChars` — parsed JSON response (capped at 8192 output tokens)

Approximation: **tokens ≈ chars / 4** (see `log-ai-sync-cost.ts`).

## Observed ballpark (12-chapter dense fixture)

From `generate-reflect.test.ts` dense map (12 pursuits, one full reflect call):

| Metric | Order of magnitude |
|--------|-------------------|
| Input chars | ~40–80k (map context dominates) |
| Output chars | ~3–8k |
| Estimated input tokens | ~10–20k |
| Estimated output tokens | ~1–2k |
| Estimated USD per sync (Gemini 2.5 Flash) | **~$0.002–0.005** |

Larger maps or 4-call batches (32+ dirty pursuits) scale linearly: up to **~4×** per sync tap.

## Projected monthly cost (single active user)

Assumptions: 1 foreground refresh per editing session, 5 sessions/week, ~$0.004/sync average.

| Scenario | Syncs/month | Est. USD/month |
|----------|-------------|----------------|
| Light (2 sessions/week, small map) | ~8 | ~$0.03 |
| Typical (5 sessions/week, 12 chapters) | ~20 | ~$0.08 |
| Heavy (daily edits, large map, partial batches) | ~60 | ~$0.25 |

These are **not** exponential: cost grows with **sessions that produce stale readings** and **~1 periodic full sync per 7 days max**, not with app-open time alone.

## Phase 2 (shipped 2026-07-04)

Dirty-first reflect routing: edits with an active dirty ledger use incremental `mode: "dirty"` + `pursuits-only` scope (edit-only batches skip theme synthesis). Edit-triggered debounce (~60s) enabled on mobile. **Deferred:** Gemini explicit context caching — see [`AI-SYNC-PHASE2-INCREMENTAL-COST.md`](./AI-SYNC-PHASE2-INCREMENTAL-COST.md).

## Phase 2.5 — periodic full regen (shipped 2026-07-04)

When dirty ledger is empty and cache matches versions, `isPeriodicFullRefreshDue` may force a full reflect (default interval 7 days via `AI_FULL_REFRESH_INTERVAL_MS`). Keeps theme oneLiners and overall Reading hero fresh without reverting everyday edits to full-map cost. Logged as `periodicFull: true` in `[map/ai-sync] cost`.

## Ops logging

Each ai-sync logs structured cost to server console:

```
[map/ai-sync] cost { userId, estimatedInputTokens, estimatedOutputTokens, estimatedUsd, realTokenUsage?, ... }
```

When live Gemini calls report usage, `realTokenUsage` includes billing-grade `inputTokens`, `outputTokens`, `cachedInputTokens`, `cacheHitRate`, and `realUsd` (cached input billed at 75% off list input rate).

Implementation: [`src/lib/map/log-ai-sync-cost.ts`](../src/lib/map/log-ai-sync-cost.ts), wired in [`src/app/api/map/ai-sync/route.ts`](../src/app/api/map/ai-sync/route.ts).

Pricing constants (`GEMINI_25_FLASH_*_USD_PER_M`) should be updated when the production model changes.
