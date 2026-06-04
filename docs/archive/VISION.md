# Pathfinder — Vision

*Reconciled with repo: 2026-05-19 (`CHANGELOG.md`, `DECISIONS.md`). Engineering truth wins on conflicts.*

## What this product is

People are already using AI to process their lives.
They talk through problems, decisions, fears, and wins.
But nothing is captured. Nothing is structured. Nothing is saved.
The conversation ends and the insight disappears.

Pathfinder is where those conversations become a map you can actually look at.

---

## The problem we solve

There are two kinds of tools people use to understand their lives:

**Structure tools** — goal trackers, life wheels, productivity apps.
They get abandoned because the input is too hard.
Nobody wants to open a dropdown to categorise a moment in their life.

**Expression tools** — journals, voice notes, AI chat.
They get abandoned because nothing useful comes out.
You pour yourself in and get nothing back you can hold onto.

Pathfinder sits in the gap.
You speak naturally. The AI understands your context.
It extracts structure and asks you to confirm.
Your map gets richer without you doing any filing work.

---

## The insight

The cost of recording your life has finally dropped low enough that people will actually do it.

Not because we built a better form.
Because we removed the form entirely.

You talk. The AI listens, understands what already exists in your map, and writes back only what's new.
A mark for what's done. A pursuit for what you're working toward. A question for what's unclear.

Structured items: one card at a time in the confirmation queue — nothing committed until you confirm or skip.
Uncertain items: surfaced on the tree immediately as unresolved marks for you to resolve in place (not another card).

---

## What Pathfinder gives you

A single page where you can see:

- **What you feel** — timeline notes (marks) and moments that mattered, captured in your own words
- **What you're doing** — pursuits you're actively building across every area of your life
- **Who you are** — the pattern that emerges when work, money, relationships, health, and becoming are all visible at once

Not a to-do list. Not a journal. Not a goal tracker.
A map of your life that grows every time you use it.

---

## The five themes

Every life moves across five domains (taxonomy `2026-05-19-v6`, **17 hubs**):

- **Work & Career** — what you do, where it's taking you, who you're building with
- **Money & Finance** — what you're earning, building, protecting, and owning
- **Who I'm Becoming** — purpose, inner life, joy you protect (hobbies, culture, experiences live here under **Joy**)
- **People & Relationships** — family, romance, friendships
- **Health & Body** — movement, nutrition, rest, appearance

These aren't categories to fill in.
They're the dimensions of a life — visible together, for the first time, on one map.

A separate **Pleasures** theme was explored and **retired**; leisure and joy belong under **Who I'm Becoming → Joy**, not a sixth pillar.

---

## Personalised context

Pathfinder gets more valuable the more it knows about who you are.

At onboarding, we ask for a small number of high-signal fields: age, location, life stage — single, partnered, married, kids. That's enough to matter.

That context personalises benchmark insights at the hub and theme level. One sentence on how a pursuit or milestone compares to peers at the same stage and in the same place. For a 29-year-old in London, £10k in a Stocks & Shares ISA puts you ahead of roughly 70% of people your age.

This is not a dashboard of charts. It's a single contextual line, shown where it's relevant, so the map feels like it knows you.

The benchmark layer works from day one — drawn from AI pattern knowledge, not from months of your own history first.

---

## What makes this different

Every other tool forces a choice: structure or expression.
Pathfinder is the first to connect them.

The AI knows your existing map before it proposes anything.
It doesn't just parse text — it reasons about what's already there.
It completes what exists before creating anything new.
It flags what it's uncertain about rather than guessing.

That context-awareness is the core innovation.
Not AI alone. Not a map alone.
The two in conversation with each other.

---

## How Pathfinder fits alongside AI

Pathfinder is not a replacement for Claude or ChatGPT — it's where those conversations land.

Use Claude to think through a decision, plan a goal, or understand your options in depth.
Then bring what matters into Pathfinder via Stream.

Pathfinder holds the start, the finish, and every meaningful checkpoint in between.
That's what AI conversations alone can never do — they end.
Your map doesn't.

The division of labour is intentional:

Claude and ChatGPT → thinking partner
Deep advice, task lists, planning, research
"How do I apply for a UK spousal visa?"
"What should I consider before changing careers?"

Pathfinder → memory and progress tracker
Milestones, marks, momentum, the story of your life
"Visa application submitted"
"First interview secured"
"First day completed"

Neither does the other's job well.
Together they're complete.

---

## North star

> Help someone understand themselves —
> what they feel, what they're doing, who they are —
> all on one page.

Every product decision should be tested against this.
If a feature doesn't help someone see themselves more clearly, it doesn't ship.

---

## Related docs

| Doc | Role |
|-----|------|
| [`BRIEF.md`](./BRIEF.md) | Short product + tree summary |
| [`docs/STREAM.md`](./docs/STREAM.md) | Stream feature spec |
| [`docs/MOBILE-VISION.md`](./docs/MOBILE-VISION.md) | Future mobile metaphor |
| [`DECISIONS.md`](./DECISIONS.md) / [`CHANGELOG.md`](./CHANGELOG.md) | What shipped and why |
| [`PROJECT.md`](./PROJECT.md) | Deeper philosophy (hydraulic effect, etc.) |

*When in doubt, come back here for product intent; check DECISIONS/CHANGELOG for what the code actually does.*
