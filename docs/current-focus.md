# Current focus (June 2026)

**Active product:** mobile app in `pathfinder-mobile/`.  
**Backend:** `pathfinder/` API + Prisma + Stream/Story AI. Desktop tree UI is on hold.

See also [../../START-HERE.md](../../START-HERE.md) and [../../pathfinder-mobile/BACKLOG.md](../../pathfinder-mobile/BACKLOG.md).

## Recently shipped

- UI consolidation Phases 1–8 (map panels, Stream shell, Review, Story, settings, dashboard, finance, mark, profile, tasks).
- Self & Mind taxonomy v7 + canonical hub dedupe on `GET /api/branches`.
- Workspace navigation docs (`START-HERE.md`, `pathfinder/docs/archive/`).

## Priorities

1. **Deploy** — production API must include hub dedupe + await taxonomy on branches (if not already live).
2. **Map** — edit-map move-to-hub works; full reorder/reparent still backlog.
3. **Stream** — scoped composer, confirm queue, pursuit/child apply pipelines.
4. **Review & Story** — live; tune prompts via `PROMPTS.md` as needed.

## Source of truth (do not skip)

| Data | Where |
|------|--------|
| Theme labels / subtitles | `src/lib/life-areas.ts` + `pathfinder-mobile/theme/tokens.ts` |
| Hub labels in UI | Database via hub taxonomy sync + `dedupeDuplicateRootHubs` |
| Product vocabulary | `GLOSSARY.md`, `ONTOLOGY.md` |

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
