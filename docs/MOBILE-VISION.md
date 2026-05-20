# Mobile Vision — The Level Map

*Captured: May 2026. Product vision only — not a current build target. Reconciled with repo: 2026-05-19.*

## The core idea

On desktop, Pathfinder is a poster: a branching tree you look at, pan across, and explore.

On mobile, Pathfinder is a landscape you move through.

The metaphor shifts from map-as-diagram to map-as-world. The same data, a different camera.

---

## The interaction model

**Reference:** Candy Crush level select screen. Temple Run.

Imagine a winding path that scrolls vertically, viewed from a three-quarter elevated angle.
The path is your life. You move along it. Nodes are stops.

- **Trunk** = the main highway between themes
- **Branches** = side roads off the highway
- **Pursuits / goals** = stops along the branches
- **Marks** = checkpoints along the path

The experience is not "open the app and see a diagram." It is "open the app and pick up where you left off on your path."

---

## Key differences from desktop

| Desktop (poster view) | Mobile (level map) |
|----------------------|-------------------|
| Pan and zoom freely | Scroll vertically; snap to node |
| Full tree visible at once | Progressive reveal as you scroll |
| Click node to open detail panel | Tap stop to open; swipe to continue |
| Editing and layout manipulation | Primarily viewing and capturing |
| Mouse hover reveals labels | Labels always visible at current zoom |
| Multiple themes visible simultaneously | One branch in focus at a time |

---

## Navigation model

**Vertical scroll** is the primary gesture. The path winds upward (or into the future).
Older marks are at the bottom; current pursuits and future milestones are higher up.

**Snap-to-goal navigation.** Tapping a destination on the path animates the camera to that node.
The path between current position and destination plays out — you "travel" there.

**Branch entry.** The trunk is always visible as a vertical spine. Branches extend laterally.
Tapping a branch entry point slides the camera sideways onto that branch.
A back gesture returns to the trunk.

**Current position indicator.** A subtle marker shows where "now" is on the path —
anchored to the most recently confirmed mark or the current active pursuit.

---

## Visual language

The three-quarter elevated angle creates depth cues: nodes further away are smaller and slightly
hazier. The path itself has texture — worn earth, not clean SVG lines.

Node types read instantly from their shape and size:
- **Theme gateway** — large, landmark quality. You see these from far away.
- **Hub entry point** — mid-size. Marks a junction on the trunk.
- **Pursuit stop** — standard size. The most common node.
- **Mark checkpoint** — small dot. Clustered along branch segments.
- **Milestone** — raised marker along a pursuit segment. Like distance markers on a road.

Bloom/lifecycle state reads through the node's visual treatment:
- Bud → dimly lit, barely visible
- Growing → glowing, animated pulse
- Bloomed → bright, resolved, no animation
- Ended → weathered, faded

*(Desktop uses milestone-derived visual phase and panel status buttons — keep vocabulary aligned when mobile ships.)*

---

## Capture flow on mobile

The primary mobile capture gesture: **"What happened today?"**

A persistent floating button at the bottom of the screen opens Stream.
The camera zooms slightly — a soft blur on the path behind the input sheet.
The user speaks or types. Cards appear. Confirmed items animate onto the path.
The sheet closes. The camera pans to the newly added node.

This is the mobile-native expression of [Stream](./STREAM.md).

---

## What this is not

This is not a stripped-down version of the desktop app.
It is not the same layout rendered at a smaller size.
It is the same data expressed through a fundamentally different spatial metaphor.

The desktop tree is a diagram that reveals structure.
The mobile path is a world that rewards exploration.

Both should feel like Pathfinder — the typography, the colour system, the node vocabulary are shared.
The camera, the interaction model, and the sense of movement are entirely different.

---

## Implementation notes

Build mobile only after:

1. The desktop tree is visually stable with real data
2. The data model is mature enough that a second camera can read from it without changes
3. The node vocabulary (pursuit, mark, milestone, hub, theme) is stable in both code and visual form

The mobile path shares the same Prisma schema and API layer entirely.
The difference is purely in the rendering and interaction layer.

No schema changes are required or desired to support mobile.

---

## Open questions (unresolved)

**Fork points on the path.** When a user has two simultaneous pursuits in the same hub,
the path splits into two parallel tracks that run side by side before rejoining.
The visual treatment of this split needs design work — it should feel like a real fork in the road,
not an org-chart branch.

**Time direction.** Does the path run bottom-to-top (past at bottom, future at top)?
Or does it wind freely like a game level — loops, switchbacks, elevation changes?
The winding/game-level model is more emotionally engaging but harder to navigate.

**Marks vs milestones at mobile scale.** Marks (timeline notes) and milestones (steps within a pursuit)
are visually distinct on desktop. At mobile node sizes they may need to collapse into a single
"checkpoint" type with a detail tap to distinguish them.

---

## Related docs

- [`../VISION.md`](../VISION.md) — product north star
- [`STREAM.md`](./STREAM.md) — Stream on desktop (shared intake)
- [`architecture.md`](./architecture.md) — persistence vs presentation
