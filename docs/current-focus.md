> **SUPERSEDED — historical snapshot (June 2026). Do not plan from this file.**  
> Priorities, module paths, and taxonomy version below are stale (e.g. taxonomy is now **v13** `2026-06-20-v13-timeless-category-labels`; Story tab, Stream backend, and marks are gone; `hub-*` modules were renamed `category-*` / `taxonomy-sync`).  
> **Use instead:** [`../AGENTS.md`](../AGENTS.md), [`../ONTOLOGY.md`](../ONTOLOGY.md), [`../GLOSSARY.md`](../GLOSSARY.md), [`../DECISIONS.md`](../DECISIONS.md) (newest entries first), and `pathfinder-mobile/TERMINOLOGY.md` (workspace-external).

# Current focus (June 2026)

**Active product:** mobile app in `pathfinder-mobile/`.  
**Backend:** `pathfinder/` API + Prisma + Stream/Story AI. Desktop tree UI is on hold.

See also [../../START-HERE.md](../../START-HERE.md), [../../.cursor/rules/pathfinder-current-state.mdc](../../.cursor/rules/pathfinder-current-state.mdc), and [../../pathfinder-mobile/BACKLOG.md](../../pathfinder-mobile/BACKLOG.md).

## Product frame (canonical)

| Category | Surface | Notes |
|----------|---------|-------|
| **Store** | Map | Pursuits on surface; marks in theme detail |
| **Benchmark fields** | Settings | Name, age, location only |
| **View (whole map)** | Story | Regenerated; not editable |
| **View (node scope)** | Insights sparkle | Regenerated; not editable |
| **Input verb** | **+** | Add pursuit only |

**Hidden from mobile UI:** tracks/hubs (`Branch`, `branchId` / `categoryId`) — auto-assigned via `default-category.ts`; mobile fetches `GET /api/map-data`. Six themes including **Play & Leisure** (taxonomy v8).

**Retired:** Profile tab, UserMemory blob, Review tab, Now tab, map-wide Stream sheet, track pickers.

## Recently shipped

- App simplification: one store, Profile → Settings personal fields.
- Hidden tracks: flattened theme panels, silent `branchId` on all creates.
- Play & Leisure theme restored (six themes, 3-3 map canopy, 20 system hubs).
- Gaps sheet (map utility bar), edit-map reparent, pursuit capture progress.

## Priorities

1. **Deploy** — taxonomy v8 live on production API (`TAXONOMY_VERSION` `2026-06-08-v8-play-leisure`).
2. **Map** — edit-map move/reparent works; full reorder still backlog.
3. **Story / Insights** — tune prompts via `PROMPTS.md`; fix stale Insights copy (Now tab references).
4. **Device QA** — validate hidden-track flows and six-theme layout on device.

## Source of truth (do not skip)

| Data | Where |
|------|--------|
| Theme labels / subtitles | `src/lib/life-areas.ts` + `pathfinder-mobile/theme/tokens.ts` |
| Hub taxonomy (AI + silent assign) | `src/lib/taxonomy.ts`, hub sync; mobile: `default-category.ts` |
| Product vocabulary | `GLOSSARY.md`, `ONTOLOGY.md`, `pathfinder-mobile/TERMINOLOGY.md` |

## Backend touch points

- `src/app/api/` — routes mobile calls
- `src/lib/hub-dedupe.ts`, `src/lib/hub-taxonomy-sync.ts`
- `src/lib/hub-catalog.ts`, `src/lib/ai/stream-extract.ts`
- `prisma/schema.prisma`

## Do not drive-by rewrite

- `src/components/tree/` — frozen desktop UI unless explicitly requested
- Prisma cosmetic renames (`limbId`, `GoalFork`) — deferred

## Ops

- **`GEMINI_API_KEY`** for Stream extract and Story
- Hub cleanup: `npm run backfill:hub-taxonomy` in `pathfinder/`
- Mobile typecheck: `cd pathfinder-mobile; npx tsc --noEmit`
