# Map Reading Compiler

**Status:** Shipped (2026-06-13)  
**Audience:** Backend / AI pipeline authors  
**Related:** [`PLAN-REFLECTION-SYNC.md`](../../pathfinder-mobile/PLAN-REFLECTION-SYNC.md), [`ONTOLOGY.md`](../ONTOLOGY.md), [`incremental-reading-refresh.ts`](../src/lib/map/incremental-reading-refresh.ts)

---

## Purpose

Reduce Gemini input tokens and improve reading reliability by computing **deterministic facts** from pursuit attribute layers **before** AI runs.

The compiler is **backend-only** — users never see the packet. They see **Reading** (Insights tab) and **Insight** (inline panel).

---

## AI interpretation ladder

1. **Facts** — reading compiler (silent)
2. **Quick questions** — user confirms ambiguous pursuit title/context (pursuit panel MC)
3. **AI prose** — Reading + panel Insight when grounded enough

Relationship Quick questions (MC between two pursuits) are **future** — not built yet.

---

## Input → output

```
Pursuit fields (title, status, deadline, significance, category, milestones)
  + AiReadingDirtyItem ledger (entity ids + optional details JSON)
  + formatMapContext / formatPursuitContext
        ↓
compileReadingPacket()
        ↓
ReadingPacket { changeEvents, categorySignals, recentEvents, mapAggregates }
        ↓
generateReadingDelta (story) · generate-pursuit-enrich (scoped context)
```

`recentEvents` uses the same spine derivation rules as the mobile Timeline tab (`spine-events.ts`).

---

## ReadingPacket shape

```ts
{
  changeEvents: string[];           // "Senior Engineer at Acme: status ACTIVE → COMPLETE"
  categorySignals: Array<{
    themeLabel: string;
    categoryLabel: string;
    byStatus: Record<string, number>;
    pursuits: Array<{ title; status; deadline?; significance; signal?: "gap" | "arrival" }>;
    facts: string[];                // "1 complete, 1 active with deadline Sep 2026"
  }>;
  recentEvents: {
    past: Array<{ kind; date; placement; title; themeLabel; significance? }>;
    upcoming: Array<{ kind; date; placement; title; themeLabel; significance? }>;
  };
  mapAggregates: {
    totalPursuits: number;
    upcomingDeadlines14d: number;
    upcomingDeadlines30d: number;
    recentCompletions90d: number;   // completions in last 90 days, not all-time
    highSignificanceActive: string[];
  };
  gapFacts: string[];               // "Significant but stalled: …" per gap-flagged pursuit
}
```

---

## Example: two Job pursuits

| Pursuit | Category | Status | Deadline |
|---------|----------|--------|----------|
| Senior Engineer at Acme | Work · Job | Complete | — |
| Product Lead search | Work · Job | Active | 2026-09-01 |

**Compiler output (facts — no AI):**

- Category signal: Work · Job — 1 complete, 1 active with future deadline
- Change event (if status just changed): `Senior Engineer at Acme: status ACTIVE → COMPLETE`

**AI job:** Polish into Insights **Reading** prose — do not re-derive counts or status mixes from raw JSON.

**Quick questions:** Only if a pursuit title is ambiguous — not for this example.

---

## Dirty ledger details

`AiReadingDirtyItem.details` (optional JSON) stores structured before/after on mutations:

```json
[{ "field": "status", "from": "ACTIVE", "to": "COMPLETE" }]
```

Set by goal/mark/milestone PATCH routes. Compiler turns these into `changeEvents[]`.

---

## Integration points

| Consumer | Uses packet for |
|----------|-----------------|
| `generateReadingDelta` | Primary user message (replaces filtered nested map JSON) |
| `generate-pursuit-enrich` | Scoped `formatPursuitContext` + optional category facts |
| `ai-sync` metrics | `readingPacketChars` for token savings telemetry |

Full refresh (`generateInsightsAndStory`, `generateStory`) still uses full `formatMapContext` when delta is inappropriate (missing cache, deletions, broad drift, >12 dirty pursuits).

---

## Archive and lifecycle events

Archive is **not** a second AI package. It is a lifecycle event plus a change to the live map facts:

```
Pursuit archived
  -> `Goal.archived = true`
  -> dirty event: `Pursuit archived: "..."`
  -> archived pursuit is removed from live category signals / aggregates
  -> full Reading regen when required
  -> cached pursuit Insight is pruned
```

Normal Reading packets should describe the **live map**. Archived rows remain available for restore in Settings, but they should not keep contributing to whole-map interpretation.

Open follow-ups:

- ~~Add an explicit **restore** dirty event~~ — shipped: `pursuit_restored` on PATCH `archived: false`.
- ~~Mark mark-archive/delete operations dirty~~ — shipped: `mark_archived` on DELETE/PATCH archive.
- Decide whether permanent delete should also clear historical cache fragments, audit metrics, and pending dirty rows.
- **Mobile Timeline** should eventually import shared spine rules from `spine-events.ts` (today: parallel client derivation in `build-timeline-spine.ts`).

---

## Next improvement: persistent AI fact layer

The shipped compiler computes facts during sync. The recommended next step is to make those facts more reusable and layered:

```
Operational data
  -> pursuit facts
  -> category facts
  -> theme facts
  -> map facts
  -> small Reading packet
  -> cached AI prose
```

Target fact types:

- **Pursuit facts:** title, theme, category, status, deadline, significance, completion state, key milestones.
- **Category facts:** counts by status, active-with-deadline list, recent completions, high-significance pursuits.
- **Theme facts:** category coverage, sparse themes, overloaded themes, recent mark activity.
- **Map facts:** total live pursuits, deadline pressure, active/paused/completed mix, high-significance active set.
- **Lifecycle events:** pursuit added, archived, restored, completed, renamed, recategorized; mark added, updated, archived.

Why this matters:

- Lower token cost: Gemini receives compact facts rather than re-reading broad map JSON.
- Better accuracy: counts, status mixes, deadlines, and archive behavior are deterministic.
- Fewer API calls: small edits can update facts and revise prose without full insight regeneration.
- Easier QA: facts can be unit-tested independently from model output.

This should remain backend-only. Users see **Reading** and panel **Insight**, not fact records.

---

## What the compiler must not do

- Invent psychology or motivation not in user-entered text
- Assert pursuit-to-pursuit succession as fact without user confirmation (peers in same category only)
- Replace Quick questions when title/context is genuinely ambiguous

---

## Files

| File | Role |
|------|------|
| `src/lib/map/compile-reading-packet.ts` | Packet builder |
| `src/lib/map/reading-dirty-ledger.ts` | Dirty tracking + details |
| `src/lib/map/generate-reading-delta.ts` | Story delta consumer |
| `src/lib/pursuit/generate-pursuit-enrich.ts` | Scoped enrich consumer |
