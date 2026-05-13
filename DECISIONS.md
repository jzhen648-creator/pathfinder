# Decisions

Short-lived engineering decisions and behavior notes. Prefer dates + one paragraph each.

## 2026-05-12 — Theme & hub vocabulary

User-facing and canonical-doc vocabulary is **theme** (outer pillar) and **hub** (track under a theme; goals/marks attach there). **Timeline note** is preferred over **mark** in UI; the Prisma model remains `Mark`. **Goal evolution** (UI: *Evolve goal*) replaces older **continuation** wording. **New hub splits from timeline moments** (`parentBranchId` / `turningPointId` on new `Branch` rows) are **removed** from the product — API `POST /api/branches` only creates **root** hubs; legacy split rows may still exist in old databases. TypeScript/Prisma identifiers such as `LifeAreaId`, `limbId`, and `Branch` are unchanged — see [`GLOSSARY.md`](./GLOSSARY.md).

For a **file- and route-level** list of what landed in the repo (migrations, deleted modules, new APIs, dev tooling), see [`CHANGELOG.md`](./CHANGELOG.md) — especially the dated section for **2026-05-10**.

## 2026-05-10 — Life area & branch taxonomy

Locked content taxonomy for catalog labels and default root threads (four branches per area). Existing Prisma `limbId` values `finance`, `work`, `becoming`, `people`, `health` are unchanged; **`pleasures`** is a new life-area id. Starter branches use `threadType` / display names exactly as in the table.

| Life area | Branches |
|-----------|----------|
| Work & Learning | Career, Skills, Projects, Network |
| Money & Finance | Income, Investing, Protection, Giving |
| Who I'm Becoming | Purpose, Spirituality, Inner work, Habits |
| People & Relationships | Family, Romance, Friendships, Community |
| Health & Body | Movement, Mind, Sleep, Nutrition |
| Pleasures | Hobbies, Culture, Experiences, Downtime |

**Pleasures placement on the tree:** provisional SVG fork (`TREE_FORK_PLEASURES`), stem direction ~22°, catalog color `#38BDF8`, `life-areas` angle `102°`, and roadmap tints — confirm with design before treating as final art direction.

**Money & Finance branches (update):** **Savings** is no longer a default thread name. Runway and long-term allocation narratives sit on **Investing**; **Protection** covers emergency fund, insurance, and broader financial safety net / resilience. Default order: Income → Investing → Protection → Giving.

## 2026-05-10 — Tree Focus Mode

Focus Mode: click a limb backdrop blob, life-area title, stem hit area, or thread label to emphasize that limb; other limbs fade (opacity 0.12) with a 350ms ease transition. Escape or an empty canvas click exits focus and restores normal opacity layering (still respects existing `getOpacity(focused, …)` dimming when no limb is focused). Driven by `focusedLimbId` in `tree-view.tsx`, gated by `FLAGS.FOCUS_MODE` in `src/lib/flags.ts`. Limb chrome clicks do not open the area sidebar; goal and timeline-moment nodes keep their sidebar behavior.

## Core Product Vision

Pathfinder's founding insight: most people are already using AI to dump their thoughts — fears, plans, goals, anxieties — but nothing comes out the other side. The conversation ends and nothing changes.

Pathfinder gives that dump somewhere to land.

A user speaks or types freely — messy, non-linear, emotional. AI extracts meaning, structure, and intent. The output doesn't sit in a chat history. It becomes milestones on a branch. Marks on the tree. Part of the permanent visual record of a life.

This is the product in one sentence:
Pathfinder turns the way people already think — messy, non-linear, emotional — into a structured map of their life.

## Stream (brain dump feature)

Name: Stream
Trigger: "Stream" button on each goal panel
Interaction: Single open input — text or voice. No questions, no prompts. Just space to think out loud.
AI extracts: refined goal title, motivations, blockers, suggested milestones, 2-3 sentence narrative summary.
Output: presented back as "Here's what I heard" — user confirms, adjusts, or discards each piece.
What's confirmed writes back to the goal: milestones added to hex, narrative saved, tree updated.

Why it's different: the output isn't a summary in a notes field. It changes the shape of the tree. The map evolves from what you said.

Why it's new: no product combines unstructured brain dump → AI extraction → enrichment of a visual life map. The tree responds to your thinking. That feedback loop is genuinely novel.
