# AI information layering matrix

**Status:** Audit snapshot (2026-06-19) — pre–TestFlight prompt pass  
**Audience:** Backend / product — what each AI surface is instructed to include  
**Related:** [`READING-COMPILER.md`](./READING-COMPILER.md), [`INSIGHT-ROADMAP-PLAN.md`](./INSIGHT-ROADMAP-PLAN.md)

---

## Intended boundary (product)

| Level | Job |
|-------|-----|
| **Whole-map Reading** | Shape of the life — names pursuits + status, cross-theme weight, genuine whole-pursuit arrivals. **Not** milestone/deadline execution audits. |
| **Theme insight** | Cross-pursuit dynamics within one theme (tension, balance, friction). |
| **Pursuit insight** | Execution — deadline/milestone reality, at most one concrete next step. |

---

## Actual matrix (before pre-TestFlight fix)

Legend: **R** Required · **A** Allowed · **D** Discouraged · **B** Banned · **—** Not mentioned

| Field | Whole-map Reading | Theme insight | Pursuit insight |
|-------|-------------------|---------------|-----------------|
| Pursuit title | **R** verbatim | **A** 1–2 examples | **R** verbatim / short ref in body |
| Pursuit status | **A/R** gap/arrival from packet | **A** tone rules | **R** ACTIVE/COMPLETE/PAUSED rules |
| Significance | **A** gap lens, prefer 4–5 | **—** | **A** in headline |
| Deadline / time-to-go | **D/A conflict** — banned roll-ups but L65 required deadlines | **D** — execution owned by pursuit sheet | **R/A** in headline |
| Milestone presence/absence | **D/A conflict** — banned checklists but gap/pace facts in packet | **D** | **R/A** progress, suggestedMilestones |
| Milestone completion detail | **A** via Arrival lens (ambiguous) | **D** | **R** tone celebratory when done |
| Context description | **—** | **—** | **A** grounds enrich body |
| currentAmount / targetAmount | **A** when ≥2 amount pursuits | **—** | **A** benchmarking |
| Marks | **A** in context | **A** pursuit + mark in reflective | **A** optional includeMarks |
| Cross-pursuit (within theme) | **A/R** connect in paragraphs | **R** competition/reinforcement | **R** body names sibling |
| Cross-theme relationships | **A** panoramic; **B** in sparse mode | **—** | **R** cross-map awareness |
| Profile benchmarking | **A** holistic when age+location | **A** contextual field | **A** fromMap/comparison |
| Concrete suggestions | **D** ≤1 total | **A** ≤1 in combined | **R** ≤1 per pursuit |

**Silence finding:** Whole-map prompt never defined “execution vs panorama” — L27 banned roll-ups while L65 required milestone/deadline in every sentence.

---

## Divergences (actual vs intended)

| Issue | Source |
|-------|--------|
| Milestone/deadline audit in Reading | `generate-story.ts` L65; packet `gapFacts`, `milestonePaceFacts` |
| Gap lens at whole-map level | `generate-story.ts` L48–49, L56, L59; duplicate in `generate-reflect.ts` L139–151 |
| Arrival conflates milestone vs pursuit | `generate-story.ts` L50; `INSIGHT-TONE-CONTRACT.md` L14 (doc) |
| Duplicate WHOLE-MAP rules in reflect | `generate-reflect.ts` L139–151 + L180 `buildStorySystemPrompt` |
| `global` / `hubs` cache generated, not shown on mobile | `generate-insights.ts` |

---

## CeMAP trust bug (Job 1 summary)

**Symptom:** Reading claimed CeMAP qualification “completed” while ACTIVE, 2/3 milestones.

**Root cause:** Arrival lens + model conflation; not `computePursuitSignal` (arrival only for `status === COMPLETE`). Amplifiers: `previous_reading` anchoring; `thinPacketForMapDepth` wiped all past spine events when `recentCompletions90d === 0`.

**Fix (pre-TestFlight):** Prompt disambiguation, retraction rule, packet thinning fix — see Phase 0 in implementation brief.

---

## Optimality notes

**Gaps:** Cross-theme synthesis underused; no explicit pursuit-vs-milestone rule (fixed in prompt pass).

**Waste:** `InsightCache.global`, duplicate reflect prompt block.

**Ambiguous (founder call):** Richness indicator UI (parked in design system); context/insight merge; suggested next pursuits; connection lines.

---

## Recommended prompt changes (ordered by impact)

1. P0 — Arrival disambiguation + previous-reading retraction + `thinPacketForMapDepth` fix  
2. P1 — Remove Gap lens from Reading; fix L65; ignore execution packet fields for panorama  
3. P2 — QQ copy; relationship clarifier guard  
4. Post-TestFlight — dedupe reflect prompt; stop unused global/hubs generation  
