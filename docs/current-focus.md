# Current focus (June 2026)

**Active product:** mobile app in `pathfinder-mobile/`.  
**Backend:** `pathfinder/` API + Prisma + Stream/Story AI. Desktop tree UI is on hold.

See also [../../START-HERE.md](../../START-HERE.md) and [../../pathfinder-mobile/BACKLOG.md](../../pathfinder-mobile/BACKLOG.md).

## Priorities

1. **Map** — overview canopy, theme bridge, hub/pursuit drill, MapSheet, pursuit visuals, edit-map move-to-hub.
2. **Stream** — scoped composer (map + detail routes), confirm queue, pursuit/child apply pipelines.
3. **Review & Story** — client Review triage; Story via `/api/story` with shared insight cards.
4. **Taxonomy** — Self & Mind theme + v7 hub names; `GET /api/branches` awaits sync before response; keep `life-areas.ts` ↔ `tokens.ts` aligned.
5. **UI consolidation Phase 8** — settings, dashboard, finance, mark screens → shared primitives.

## Source of truth (do not skip)

| Data | Where |
|------|--------|
| Theme labels / subtitles | `src/lib/life-areas.ts` + `pathfinder-mobile/theme/tokens.ts` |
| Hub labels in UI | Database via hub taxonomy sync (`src/lib/taxonomy.ts`, `hub-taxonomy-sync.ts`) |
| Product vocabulary | `GLOSSARY.md`, `ONTOLOGY.md` |

## Backend touch points

- `src/app/api/` — routes mobile calls
- `src/lib/hub-catalog.ts`, `src/lib/ai/stream-extract.ts` — Stream routing
- `prisma/schema.prisma` — data model

## Do not drive-by rewrite

- `src/components/tree/` — frozen desktop UI unless explicitly requested
- Taxonomy sync semantics on `GET /api/branches` — dedicated change only
- Prisma cosmetic renames (`limbId`, `GoalFork`) — deferred

## Ops

- **`GEMINI_API_KEY`** for Stream extract and Story
- After taxonomy bumps: `npm run backfill:hub-taxonomy` in `pathfinder/`
- Mobile typecheck: `cd pathfinder-mobile; npx tsc --noEmit`
