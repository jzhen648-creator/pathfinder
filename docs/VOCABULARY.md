# Almanac Vocabulary

**Purpose:** Name pursuit-related concepts, mark duplicates, show where data lives.  
**Scope:** Mobile product + `pathfinder/` backend.  
**See also:** [`GLOSSARY.md`](../GLOSSARY.md) (persistence hierarchy), [`pathfinder-mobile/TERMINOLOGY.md`](../../pathfinder-mobile/TERMINOLOGY.md) (UI copy).

---

## Glossary (selected terms)

### enrichAnswers

| | |
|---|---|
| **Meaning** | Structured quick-question answers: `{ clarifierId, prompt, selectedOption }[]`. |
| **INPUT / OUTPUT** | **INPUT** (user selections) |
| **Stores** | `Goal.enrichAnswers` (Prisma `Json?`) — **single authoritative QQ store** (since 2026-06-20) |
| **Synonyms** | quick-question answers |
| **Canonical** | **enrichAnswers** (field); **quick question** (UI) |

### Description

| | |
|---|---|
| **Meaning** | Authored pursuit prose: create-time text, manual notes, stream digest. **Not** QQ answers. |
| **INPUT / OUTPUT** | **INPUT** (derived cache from context log for authored kinds only) |
| **Stores** | `Goal.description` |
| **Synonyms** | Context section (UI) |
| **Canonical** | **description** (field); **pursuit context** (concept) |

### PursuitContextEntry / context log

| | |
|---|---|
| **Meaning** | Append-only log for authored context events (`create`, `manual_edit`, `stream_digest`, `ai_merge`). |
| **INPUT / OUTPUT** | **INPUT** |
| **Stores** | `PursuitContextEntry` table |
| **Note** | Legacy `clarifier_answer` rows may exist but are **ignored** by `derivePursuitDescriptionFromLog`; new QQ answers are **not** written here. |
| **Canonical** | **context log** |

### Clarifier / quick question

| | |
|---|---|
| **Meaning** | AI-generated multiple-choice question until answered or dismissed. |
| **INPUT / OUTPUT** | **OUTPUT** (question); answer is INPUT → `enrichAnswers` |
| **Stores** | Transient: `InsightCache.pursuitInsights[goalId].clarifiers[]` |
| **Canonical** | **clarifier** (code); **quick question** (UI) |

### Reflect / Reading / pursuit insight

See [`DECISIONS.md`](../DECISIONS.md) and [`GLOSSARY.md`](../GLOSSARY.md). Reflect production path sends **`map_context`** (includes `description` + structured **`enrichAnswers`**) and **`reading_packet`** (no QQ prose).

---

## Data map (one pursuit)

```
┌──────────────────────┬──────────────────────┬─────────────────────────────┐
│  FACTS (context)     │  STEPS (milestones)  │  AI THOUGHTS              │
├──────────────────────┼──────────────────────┼─────────────────────────────┤
│ Goal.title           │ Milestone.*          │ InsightCache.pursuitInsights│
│ Goal.description     │                      │ StoryCache.seasonRead       │
│ Goal.enrichAnswers ★ │                      │   (whole map)               │
│ PursuitContextEntry  │                      │                             │
│   (authored only)    │                      │                             │
│ status, significance │                      │                             │
│ deadline, amounts    │                      │                             │
└──────────────────────┴──────────────────────┴─────────────────────────────┘

★ = single authoritative QQ store; also sent structured in map_context
```

### What reflect reads (production)

| Data | reading_packet | map_context |
|------|----------------|-------------|
| title, status, significance, amounts, milestones | partial | yes |
| description (authored prose) | no | yes |
| enrichAnswers (structured QQ) | no | **yes** (since 2026-06-20) |

---

## Findings

### Resolved (2026-06-20 — QQ answer collapse)

1. ~~**Triple store**~~ → **`enrichAnswers` only** for new QQ answers. No mirror to log or description.
2. ~~**Description dual authority for QQ**~~ → **description = authored prose only**; derive skips `clarifier_answer`.
3. ~~**Clear-context QQ resurrection**~~ → QQ prose cannot return via log sync; **Clear** wipes authored notes only (`enrichAnswers` survive). Empty `manual_edit` prevents authored resurrection too.

### Still open (separate decisions)

- Theme vs pursuit insight shape duplication
- Reading vs reading packet naming
- Legacy **enrich** module vs **reflect**
- `ai_merge` log kind (no writers)

### Synonyms to qualify in docs

| Prefer | Retire in new docs |
|--------|-------------------|
| quick question (UI) / clarifier (code) | — |
| Reading (UI) / seasonRead (field) | Story tab |
| reflect / AI sync | enrich (legacy path) |
| enrichAnswers | — |
| pursuit context (concept) | unqualified "context" |

---
