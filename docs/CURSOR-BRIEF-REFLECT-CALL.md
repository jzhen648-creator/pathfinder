# Cursor brief — Unified "reflect" call (post-TestFlight)

**Source:** Claude architecture session, June 2026
**When to execute:** After TestFlight feedback, NOT before.
**Mode:** Plan Mode first. Propose before implementing.
**Why this exists now:** So the design is documented and 
ready, not reinvented under pressure later.

---

## The problem

Today, one user tap ("Update AI reading") makes up to 
2 Gemini calls:

1. **Reading delta** — whole-map prose for the Insights tab
2. **Pursuit enrich** — per-pursuit headline/body/tone/
   clarifiers/milestones for the pursuit detail panel

Both calls receive nearly the same map context. Both ask 
Gemini to reflect on overlapping data. The pursuit enrich 
drains one pursuit per tap, so a user with 5 dirty pursuits 
needs 5 taps × 1 enrich call each = 5 additional calls 
across multiple sessions.

Additionally, theme insights (oneLiner, reflective, 
contextual) come from a separate full insights refresh 
that duplicates the reading's map context again.

## The fix

**One Gemini call. One response. All three cache surfaces 
updated.**

Replace reading delta + pursuit enrich + theme insights 
with a single "reflect" call that returns a structured 
JSON response covering everything.

---

## What the merged call replaces

| Current call | Function | Replaced by |
|-------------|----------|-------------|
| `generateReadingDelta()` | `generate-reading-delta.ts` | `reflect` → `reading` field |
| `generateOnePursuitEnrich()` | `generate-pursuit-enrich.ts` | `reflect` → `pursuits` field |
| `generateStory()` | `generate-story.ts` | `reflect` → `reading` field (full refresh case) |
| `generateInsights()` | `generate-insights.ts` | `reflect` → `themes` field |

## What stays unchanged

| Component | Why it stays |
|-----------|-------------|
| Reading compiler (`compileReadingPacket`) | Deterministic facts BEFORE Gemini — essential; feeds the reflect prompt |
| Normalizer (`normalize-pursuit-enrich.ts`) | Gemini will still drift on JSON shape; adapt to new response schema |
| Dirty ledger (`reading-dirty-ledger.ts`) | Still need to know what changed to scope the reflect call |
| `formatMapContext` | Still the grounding payload; reflect call consumes it |
| `formatUserContext` | Profile context for benchmarking |
| `clampInsightGenerationJson` | Length/tone guardrails still apply to each pursuit/theme section |
| Enrich options (clarifyTitles, suggestConnections, includeMarks) | Settings toggles still gate what the reflect call includes |

## What gets deleted (cleanup alongside or before)

| Dead code | Why it's dead |
|-----------|---------------|
| `digestAllPendingCaptures()` in `ai-sync.ts` | No live capture path; retired in Week 1 |
| `savePendingPursuitCapture` in `stream-pursuit-apply.ts` | No API route imports it |
| `runPursuitStreamExtract` in `stream-pursuit-extract.ts` | Only called by digest |
| `assignPursuitVisualsSafe` | Mobile bypasses; icon picked at create |
| `StreamRun` model usage | Legacy; hygiene script clears remaining rows |
| Enrich drain loop in `incremental-reading-refresh.ts` | No per-pursuit queue needed — all dirty pursuits handled in one call |
| "Finish pursuit insight" button concept on mobile | No second tap needed |

---

## The reflect call — input

```typescript
// New file: pathfinder/src/lib/ai/generate-reflect.ts

interface ReflectInput {
  // From compiler
  readingPacket: ReadingPacket;
  
  // Full map context (for pursuit/theme sections)
  mapContext: MapContext;          // from formatMapContext()
  userContext: string;             // from formatUserContext()
  
  // Scoping — what needs updating
  dirtyPursuitIds: string[];      // from dirty ledger
  dirtyThemeIds: string[];        // derived from dirty pursuits
  readingDirty: boolean;          // any map change since last reading
  
  // Settings
  options: {
    clarifyTitles: boolean;       // from mobile Settings
    suggestConnections: boolean;  // from mobile Settings
    includeMarks: boolean;        // from mobile Settings
  };
  
  // Previous reading (for delta continuity)
  previousReading?: string;       // last seasonRead, if exists
}
```

## The reflect call — Gemini prompt structure

```
System prompt:
You are Pathfinder's reflection engine. You receive a 
structured map of someone's life pursuits and return a 
single JSON response containing a whole-map reading and 
per-pursuit/per-theme insights.

Rules:
- Name pursuits VERBATIM (e.g. "£500,000 ISA" not 
  "a savings goal")
- Never invent pursuits, milestones, or connections 
  not in the data
- No filler: ban "it will be interesting", "journey", 
  "keep building", "as they take shape", "holistic 
  commitment", "welcome counterpoint"
- One concrete suggestion per pursuit, max
- Be honest about gaps and sparse maps
- Use age/location for contextual benchmarking only 
  when data supports it — never invent statistics
- Headline must add information beyond the pursuit title
- Cross-reference between pursuits when the data 
  supports a real connection

User message:
Here is the current map state and reading packet.

<user_context>
{userContext}
</user_context>

<reading_packet>
{JSON.stringify(readingPacket)}
</reading_packet>

<map_context>
{JSON.stringify(mapContext)}
</map_context>

<previous_reading>
{previousReading || "None — this is the first reading."}
</previous_reading>

<dirty_pursuits>
{JSON.stringify(dirtyPursuitIds)}
</dirty_pursuits>

<options>
clarifyTitles: {options.clarifyTitles}
suggestConnections: {options.suggestConnections}
includeMarks: {options.includeMarks}
</options>

Respond with ONLY a JSON object matching this schema. 
No preamble, no markdown fences, no explanation.

{
  "reading": "whole-map reflective prose, 3–5 sentences, 
    100–140 words. Not a task list. Name pursuits verbatim. 
    If map has 1–2 pursuits: short factual, one question. 
    If 3+: panoramic reflection.",

  "pursuits": {
    "<pursuitId>": {
      "tone": "encouraging | informational | cautious | 
        celebratory | reflective",
      "headline": "one line that adds beyond the title",
      "body": "2–4 sentences, max 500 chars. Reference 
        status, deadline, milestones, siblings.",
      "clarifiers": [
        {
          "question": "disambiguation question if title 
            is ambiguous",
          "options": ["option A", "option B", "option C"]
        }
      ],
      "suggestedMilestones": [
        {
          "title": "milestone title",
          "order": 1
        }
      ]
    }
  },

  "themes": {
    "<themeId>": {
      "oneLiner": "short summary of theme state",
      "reflective": "1–2 sentences connecting pursuits 
        within this theme",
      "contextual": "benchmark sentence using age/location 
        if available, empty string if not",
      "tone": "encouraging | informational | cautious | 
        celebratory | reflective"
    }
  }
}

Only include pursuit entries for these IDs: {dirtyPursuitIds}
Only include theme entries for themes containing dirty 
pursuits: {dirtyThemeIds}
Always include "reading" — it reflects the whole map.
If clarifyTitles is false, omit "clarifiers" arrays.
If suggestConnections is false, do not invent cross-pursuit 
connections in clarifiers.
Omit "suggestedMilestones" if the pursuit already has 3+ 
milestones or status is COMPLETE.
```

## The reflect call — expected response

```json
{
  "reading": "Work is carrying real weight — Lead product 
    launch has a completed beta milestone, and Public 
    speaking just got a concrete first step with 
    Toastmasters. Money is quieter but steady: Rental 
    income is in maintaining mode at £1,700. At 29 in 
    London, running a launch while building a speaking 
    habit alongside a cash-flow asset is an unusual 
    combination.",

  "pursuits": {
    "goal_launch": {
      "tone": "encouraging",
      "headline": "Beta is real — board review is the 
        next gate",
      "body": "You've moved Lead product launch past 
        slide-deck territory into shipped software. The 
        March board review is the accountability moment 
        for what you already built.",
      "clarifiers": [],
      "suggestedMilestones": [
        { "title": "Board review presentation", "order": 2 }
      ]
    },
    "goal_speaking": {
      "tone": "informational",
      "headline": "First speech is the proof point",
      "body": "Joining Toastmasters moved Public speaking 
        from intention to commitment. The first scheduled 
        speech is the milestone that makes this real.",
      "clarifiers": [],
      "suggestedMilestones": [
        { "title": "First Toastmasters speech", "order": 1 }
      ]
    }
  },

  "themes": {
    "work": {
      "oneLiner": "Two pursuits, one shipped milestone",
      "reflective": "Job and Skills are both active — 
        launch has proof; speaking is earlier but concrete.",
      "contextual": "At 29 in London, pairing a product 
        launch with speaking practice often precedes 
        people-management transitions.",
      "tone": "encouraging"
    }
  }
}
```

## The reflect call — output processing

```typescript
// After Gemini responds:

interface ReflectOutput {
  reading: string;
  pursuits: Record<string, {
    tone: string;
    headline: string;
    body: string;
    clarifiers?: Array<{
      question: string;
      options: string[];
    }>;
    suggestedMilestones?: Array<{
      title: string;
      order: number;
    }>;
  }>;
  themes: Record<string, {
    oneLiner: string;
    reflective: string;
    contextual: string;
    tone: string;
  }>;
}

// Processing pipeline (reuse existing components):
//
// 1. Parse JSON (strip markdown fences if present)
// 2. Normalize pursuit entries (existing normalizer logic):
//    - Coerce tone to valid enum
//    - Ensure milestone order is number
//    - Flatten nested insight if Gemini wraps it
//    - Coerce clarifier options to string[]
// 3. Clamp lengths (existing clamp logic):
//    - reading: max ~140 words
//    - pursuit body: max 500 chars
//    - headline: max 80 chars
//    - oneLiner: max 60 chars
// 4. Gate enrich results (existing gate logic):
//    - Drop clarifiers if clarifyTitles is false
//    - Drop suggestedMilestones if pursuit has 3+
//    - Drop suggestedMilestones if status is COMPLETE
// 5. Write to caches in one transaction:
//    - StoryCache.seasonRead = output.reading
//    - InsightCache.pursuits[id] = each pursuit entry
//    - InsightCache.themes[id] = each theme entry
// 6. Clear dirty ledger for processed pursuits
// 7. Update mapVersion / storyVersion
```

---

## Integration into ai-sync

```typescript
// pathfinder/src/lib/map/ai-sync.ts
// Replace the current two-step flow:

// BEFORE (current):
// 1. digestAllPendingCaptures()     ← retired
// 2. refreshReadingCachesSmart()
//    a. generateReadingDelta()      ← 1 Gemini call
//    b. runPursuitEnrichLoop()      ← 1+ Gemini calls

// AFTER (reflect):
// 1. (digest removed)
// 2. generateReflect()              ← 1 Gemini call total
//    → writes reading + pursuit insights + theme insights
```

The `MAX_GEMINI_CALLS_PER_SYNC` drops from 2 to 1. 
The enrich drain loop disappears — all dirty pursuits 
are handled in one response.

**Token budget for one reflect call:**

| Section | Estimated tokens |
|---------|-----------------|
| System prompt | ~400 |
| Reading packet (compiler) | ~200–600 |
| Map context (6 themes, 10 pursuits) | ~1,500–3,000 |
| User context | ~50 |
| Previous reading | ~200 |
| **Total input** | **~2,000–4,000** |
| **Output** (reading + 3 pursuits + 2 themes) | **~500–800** |

At Gemini Flash pricing (~$0.075/M input, ~$0.30/M output):
**~$0.0005 per reflect call.** Roughly 2,000 reflects per 
dollar.

---

## What changes on mobile

| Current | After |
|---------|-------|
| "Update AI reading" button | Same button, same behavior |
| "Finish pursuit insight" button | **Gone** — no second tap needed |
| `morePending` state | **Gone** — no enrich queue |
| Enrich drain UX | **Gone** — one tap updates everything |
| Pull-to-refresh → sync | Same, but one call not two |

The mobile UX simplifies: one button, one tap, everything 
updates. No "Finish" concept, no pending pursuit queue.

---

## Migration path

1. Build `generate-reflect.ts` with the prompt and 
   response schema above
2. Build `normalize-reflect-response.ts` — adapt existing 
   normalizer to the merged schema
3. Wire into `ai-sync.ts` as a replacement for the 
   reading + enrich two-step
4. Keep the old functions for one release cycle as 
   fallback (feature flag `USE_REFLECT_CALL`)
5. After soak: delete `generate-reading-delta.ts`, 
   `generate-pursuit-enrich.ts`, `generate-story.ts`, 
   `generate-insights.ts`, enrich drain loop
6. Mobile: remove "Finish pursuit insight" button, 
   `morePending` state, enrich drain UX
7. Update PROMPTS.md with the reflect prompt as the 
   single source of truth

---

## Acceptance criteria

- One "Update AI reading" tap with 3 dirty pursuits: 
  **1 Gemini call**, reading + all 3 pursuit panels + 
  themes updated
- No "Finish pursuit insight" button appears
- Reading quality matches or exceeds current delta output
- Pursuit panel quality matches current enrich output
- Theme insight quality matches current insights output
- Normalizer catches the same Gemini drift patterns
- Token usage per call: <5,000 input, <1,000 output
- Response time: <5 seconds on Gemini Flash

---

## Explicitly out of scope

- Fact layer (separate project — uses compiler output)
- Sound, VFX, celebrations
- New mobile UI surfaces
- Marks re-enablement
- Relationship QQ experiment
- Any change to the map, creation flow, or navigation

---

## When to execute

After TestFlight feedback confirms:
1. Users actually read the pursuit panel insights
2. The "Finish" two-tap flow confused people (expected)
3. Reading quality is good enough that merging won't 
   regress it

If TestFlight shows users never open pursuit panels, 
skip the pursuit section of the reflect call and save 
the output tokens. Let real usage data shape the schema.
