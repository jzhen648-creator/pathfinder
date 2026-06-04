# Tree canopy / layout changes (session record)

**Date:** 2026-05-11  
**Scope:** `pathfinder/src/components/tree/**`, related constants and SVG rendering.

This note captures cumulative edits from the Cursor session so future work can trace intent and tune without rediscovering history.

---

## 1. Crown balance (early session)

**Goal:** Reduce one limb dominating the crown; narrow variance across life areas.

**Files:**

- `tree-forks.ts` — `STRAIGHT_LIFE_AREA_BY_ID`: compressed fork chords (`baseTipLen`, `tipLenPerIndex`, `limbStemLen`) into a shared band; People kept a modest lead for four domain threads.
- `tree-canopy-macro-composition.ts` — `MACRO_BY_AREA_ID`: tighter band for emergence / `branchAngularGapScale`; People lateral/strata nudges reduced vs outliers.
- `tree-canopy-archetypes.ts` — `ROUTING_BY_AREA_ID`: `fanHalfSpanDeg` band ~92–100°; People exploration/asymmetry toned down.

---

## 2. Hub visuals (larger → later reduced)

**Goal:** Enlarge gateway + domain hub discs; then scale back when overlap/size complaints landed.

**Representative knobs:**

- `tree-svg.tsx` — gateway stack (`gwS`), rings, core/halo; domain hub circles and glyphs (`dhS`); label sizing.
- `tree-hub-trunk-filaments.ts` — filament lateral magnitude multiplier (raised then lowered).
- `tree-limb-backdrop-bounds.ts` — principal veil ellipse `scale` (e.g. ~1.52 → ~1.28 when tightened).

**Current direction:** Smaller gateway/domain hub scale (~**1.18** vs earlier ~**1.52** pass), smaller glyphs/icons vs peak.

---

## 3. Conduit stroke scaling

**Goal:** Thicker branch conduits; then thinner after “everything too big / overlap”.

**Files:**

- `tree-view-constants.ts` — `CONDUIT_THREAD_STROKE_SCALE`, `CONDUIT_LIMB_STEM_STROKE_SCALE` (applied in `tree-forks.ts` when building stroke widths).
- `tree-svg.tsx` — `narrowThread` threshold uses thread scale; post-split stroke widths scaled consistently.
- `tree-limb-backdrop-bounds.ts` — sibling split tubes use `CONDUIT_THREAD_STROKE_SCALE`.

**Approximate trajectory:** thread scale ~**1.52** → **~1.18**; limb stem scale ~**1.28** → **~1.06** (verify file for exact values).

---

## 4. People-like spacing vs other life areas

**Goal:** Align non-People limbs closer to People **spacing** parameters.

**Files:**

- `tree-canopy-macro-composition.ts` — matched **People**-aligned rows for others: `branchAngularGapScale`, `emergenceLaneEarlyMul`, `hubAlongStemMul`, `territorialLateralSpread01`, etc.
- `tree-canopy-archetypes.ts` — converged `fanHalfSpanDeg`, `compositionalAvoidance`, `lateralReleaseConfidence`, territory asymmetry toward People band.

**Important discovery:** Archetype `fanHalfSpanDeg` barely affected hub fans until sector math changed (below).

---

## 5. Hub sector angle seed (`buildFinanceHubSectorAngles`)

**Problem:** `spanDeg = min(personality×0.93, 14.2+n×9.1)` meant the **second term almost always won** for typical `n`, so personality tuning had little effect.

**Fix:** Replace with a floor + personality + **cap** scheme so archetypes matter without always opening to ~90°.

**Overlap backlash:** Full personality span caused limb-on-limb overlap; **dial-back** tightened caps (e.g. `maxSpreadDegForBranchCount ≈ min(72°, 15.5°+n×10.6°)` — verify `tree-forks.ts` for live numbers).

**Fork templates:** `STRAIGHT_LIFE_AREA_BY_ID` chords/stems adjusted multiple times (toward People, then shorter to reduce overlap).

---

## 6. Macro sibling heading gap

**File:** `tree-canopy-macro-composition.ts` — `siblingBranchHeadingGapMul` on `branchAngularGapScale` (e.g. **1.38** → **~1.28** when reducing aggression).

---

## 7. Domain-cluster goal layout

### 7a. Full ring (360°)

**File:** `tree-branch-geometry.ts` — `goalScreenPositionDomainCluster`

- **Before:** Wedge from capped `span` rad (~small arc for few goals).
- **After:** Equal angles on **full 2π**: `theta = (2π × goalIndex) / nGoals + DOMAIN_CLUSTER_GOAL_RING_PHASE_OFFSET_RAD`.

**File:** `tree-view-constants.ts` — removed legacy `DOMAIN_CLUSTER_FAN_MAX_SPAN_RAD` / `DOMAIN_CLUSTER_FAN_SPAN_EXTRA_PER_GOAL_RAD`; added `DOMAIN_CLUSTER_GOAL_RING_PHASE_OFFSET_RAD` (default **0**).

### 7b. Closer to hub

**File:** `tree-view-constants.ts` — `DOMAIN_CLUSTER_BASE_RADIUS_PX` reduced (e.g. **94 → 72** — verify file).

**File:** `tree-branch-geometry.ts` — tighter inward breath multiplier, smaller jitter, lower `threadsMul` coefficient, lower polar `r` cap (e.g. **148 → 118** before `polarSpacingMul` — verify file).

---

## 8. Grammar / flags (context from session)

- Domain-cluster threads for goals: `tree-renderer-grammar.ts` — `LIFE_AREA_IDS_DOMAIN_CLUSTER_GOALS`, `shouldDomainClusterThread` (milestones flag dependent).

---

## Quick reference: primary tuning constants

| Concern | Where to look |
|--------|----------------|
| Fork chord / stem length | `tree-forks.ts` `STRAIGHT_LIFE_AREA_BY_ID` |
| Hub fan angle seed + widen passes | `tree-forks.ts` `buildFinanceHubSectorAngles`, `widenAdjacentBranchHeadings` |
| Macro per life area | `tree-canopy-macro-composition.ts` `MACRO_BY_AREA_ID` |
| Routing personality | `tree-canopy-archetypes.ts` `ROUTING_BY_AREA_ID` |
| Domain polar radius / phase | `tree-view-constants.ts` `DOMAIN_CLUSTER_*`, `goalScreenPositionDomainCluster` |
| Conduit pixel thickness | `tree-view-constants.ts` `CONDUIT_*_STROKE_SCALE`, `tree-forks.ts` stroke width build |
| Gateway / domain hub drawing | `tree-svg.tsx` |

---

## Verification

After substantive edits, `npx tsc --noEmit` was run in `pathfinder/` successfully.

**Note:** Numeric literals in this doc may drift if constants are retuned again; **trust the source files** for exact values.
