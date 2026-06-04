# Mobile Vision — The Spatial World

## The core idea

On desktop, Pathfinder is a poster: a branching tree you look at, pan across, and explore.

On mobile, Pathfinder is a spatial world you navigate through by tapping into it.

The map is a fixed-size canvas containing the full tree — base, themes, hubs, pursuits, marks — laid out spatially around a central anchor. The user does not directly control camera scale with pinch gestures. Instead, the camera *responds* to taps and swipes, gliding through the world as the user explores.

Three navigation levels, one continuous spatial world:

- **Base view** — the camera is pulled back. The full tree is visible. Five themes radiate from the central base. The user can pan freely to explore.
- **Theme view** — the user has tapped into a theme. The camera has glided to that theme. Hubs are clearly visible around it. Sibling themes can be reached by swiping horizontally.
- **Hub view** — the user has tapped into a hub. The camera has glided to that hub. Pursuits are clearly visible around it. Sibling hubs can be reached by swiping.

Detail of a specific pursuit opens via the existing pursuit detail route — not part of the spatial map.

## What it is NOT

- Not a free pan/zoom canvas (tried, two-finger gestures too fiddly)
- Not a vertical scroll journey (tried, single-axis scroll loses the spatial relationships)
- Not a radial tree with pinch zoom (tried, top-down felt wrong, outer themes hard to reach)
- Not a 3D scene
- Not a top-down map
- Not a list, an outline, or a hierarchy of screens

This is a single continuous spatial world. The camera moves through it. The user never sees the whole tree being rebuilt — they see the camera traveling.

## The model

**One canvas, one camera.**

The canvas is fixed-size — large enough to contain the full tree with all themes, hubs, and pursuits at their natural sizes. The base sits in the centre. The five themes radiate outward in canonical order. Each theme has its hubs arranged around it. Each hub has its pursuits.

The camera has three states the user can be in: base, at a theme, at a hub. The camera glides between these states using Reanimated springs. The user never sets the camera position directly except by panning at base view.

## Interaction model

| Level | Tap node | Swipe horizontal | Pan around | Back button |
|---|---|---|---|---|
| Base view | drill into theme | nothing | yes — single-finger pan to explore | hidden |
| Theme view | drill into hub | glide to sibling theme | no | "← Back to overview" |
| Hub view | open pursuit detail | glide to sibling hub | no | "← Back to [Theme name]" |

**Key principles:**

- **Single-finger only.** No two-finger gestures. No pinch zoom.
- **Tap is precise navigation.** Taps drill into a specific node.
- **Swipe is browsing.** Swipes move to siblings at the current level.
- **Pan only at base view.** Once the user enters a theme or hub, pan is disabled to keep each level's interaction model clean.
- **Back is contextual.** The back button appears above the tab bar within the map context. It shows what you're going back to: "← Back to overview" at theme view, "← Back to [Theme]" at hub view. Hidden at base view.
- **Smooth glide between siblings.** When the user swipes between sibling themes or hubs, the camera travels through the space between them — preserving the spatial relationship.
- **Return resets the camera.** When the user taps back, the camera returns to a default centred position at the parent level. Pan position at base view is not preserved across drill-ins.

## What the user sees at each level

**Base view.** The full tree is visible. The base sits in the centre. Five themes radiate outward with their hubs and pursuits attached. Marks are visible as small amber diamonds on the relevant branches. The user can pan around to see the whole tree if it extends beyond the viewport. Tapping a theme drills in.

**Theme view.** The camera has glided to the selected theme. The theme is large and clearly central. Its hubs are arranged around it at readable scale. Marks on this theme's branches are visible. Other themes have moved off-screen or faded to the edges. The user swipes horizontally to glide to a sibling theme. Tapping a hub drills in further.

**Hub view.** The camera has glided to the selected hub. The hub is large and clearly central. Its pursuits are arranged around it. Marks on this hub are visible at readable scale. Other hubs at this theme are off-screen or faded. The user swipes horizontally to glide to a sibling hub. Tapping a pursuit opens the pursuit detail screen.

## Visual language

- **The base** — a single anchor node in the centre of the canvas. The visual centre of gravity for the whole tree.
- **Trunk and limbs** — the connective tissue between base, themes, and hubs. Variable-width ribbons following the existing living-spine geometry.
- **Theme nodes** — large landmarks at the end of each trunk limb. Each carries its life-area colour.
- **Hub nodes** — medium nodes branching off each theme.
- **Pursuit nodes** — smaller nodes branching off each hub.
- **Marks** — amber diamonds positioned on the connectors between elements.
- **Colour** — each theme has its accent colour. The base is neutral. Connectors transition through theme palettes.

The living-spine ribbon math from earlier sessions carries forward — applied to the connectors between base, themes, and hubs.

## Camera motion

- **Reanimated springs everywhere.** No durations. Springs with sensible defaults: quick, light, decisive.
- **Animated camera transforms.** Translation and scale are interpolated, not snapped.
- **Decisive timing.** Camera glides complete in 300-400ms.
- **Haptics at level transitions.** Light haptic when the camera arrives at a new level. Soft haptic when swiping between siblings.

The map is defined by how it moves. Static screenshots will not capture what makes this map feel good — the spring physics and continuous spatial motion are the product.

## What stays from previous sessions

- Living-spine ribbon math (applied to base-to-theme and theme-to-hub connectors)
- Active-theme weighting (wider connectors near active themes)
- All API hooks (useBranches, useMarks)
- MapNode kinds and contracts
- Existing pursuit detail screen at /pursuit/[id]
- Existing theme, hub, mark detail screens — used as deep links, not in spatial map navigation
- Stream, Profile, Settings — entirely unaffected
- Visual treatment for theme, hub, pursuit, mark nodes — same rendering, new positions

## What gets thrown away

- Radial pan/zoom geometry (Session 16 first attempt)
- Linear vertical journey geometry (Session 16 second attempt)
- Pan/pinch camera
- Vertical ScrollView with snap-to-stop
- The "you are here" indicator
- Direct tap-on-map opens-sheet pattern

## Implementation phases

This is a multi-session rebuild. Each phase must be buildable and testable on its own.

- **Phase 1:** Spatial canvas geometry — base in centre, five themes radiating, hubs around themes, pursuits around hubs. Static layout, no interaction yet.
- **Phase 2:** Camera system — three camera states (base, theme, hub) with Reanimated spring interpolation. Hard-coded buttons to switch states for testing.
- **Phase 3:** Tap interactions — tap a theme to drill in, tap a hub to drill in, tap a pursuit to open detail. Back button.
- **Phase 4:** Pan at base view (shipped). Sibling swipe deferred — tap + back is the MVP navigation model.
- **Phase 5:** Motion polish — spring tuning, haptics, timing (shipped).

DECISIONS.md should record each phase.

## Why this is the right direction

The mobile map went through three previous iterations:

1. Vertical Candy Crush — single-axis scroll lost the spatial structure.
2. Radial pan/zoom — two-finger gestures fiddly, top-down camera flat.
3. Linear journey with bottom sheet — better, but still constrained to one axis.

This fourth model is the synthesis. It's spatial (preserves relationships), mobile-native (single-finger only), bounded (each level shows what's needed), and contextual (you always know where you are). The base view preserves Pathfinder's "see your whole life at once" property. Drill-in views give detail without losing spatial continuity.

Reference apps: Apple Maps zoom-to-pin behaviour, Google Earth fly-to, Apple Watch bubble grid, Things 3 project navigation.
# Mobile Vision — The Linear Journey

## The core idea

On desktop, Pathfinder is a poster: a branching tree you look at, pan across, and explore.

On mobile, Pathfinder is a journey you travel through.

The map is a continuous vertical path from the bottom of your life to the top. As you scroll, the camera moves along the trunk. You arrive at landmarks — themes, hubs, pursuits — and at each landmark, content appears below the map.

The metaphor is not "map you navigate" — it is "Strava elevation chart of your life." A single continuous path, ordered stops along the way, detail about each stop appearing as you scrub through.

## What it is NOT

- Not a free-pan canvas with pinch zoom (tried, too fiddly on a phone)
- Not a Candy Crush level-select where the path connects themes (tried, ate the trunk metaphor)
- Not a radial tree (tried, wrong for vertical screens)
- Not a 3D scene (overkill, react-native-skia not needed)
- Not a top-down map (wrong camera for a journey)

## The model

Two surfaces, one shared state:

**Top half of screen — the map.**
A vertical scrolling view of the trunk. The trunk is a continuous path running from the start of life at the bottom to the present at the top. Themes branch off the trunk to the left or right at specific points. Hubs branch off themes. Pursuits branch off hubs. Marks sit between, as moments along the path.

A fixed "you are here" indicator sits at a constant position in the viewport. As the user scrolls, the trunk moves past this indicator. When the indicator aligns with an element, that element becomes the current focus.

Elements ahead of the focus appear smaller (faux perspective via scale, not 3D). Elements behind shrink as they recede. The path itself feels like a road receding into the distance.

**Bottom half of screen — the sheet.**
A draggable bottom sheet, like Apple Maps. Three snap points:
- Small: just the title of the current focus
- Medium: focus title + immediate context (hub's pursuits, theme's hubs)
- Large: full detail of the current focus

Sheet content updates as the focus changes. Sheet can be dragged independently of the map.

## The interaction model

**Scroll the map.** Vertical scroll moves the camera along the trunk. The scroll snaps to discrete stops — themes, hubs, pursuits — with magnetic snap points. Light haptic feedback at each snap. Free-scroll between stops with momentum; snap to the nearest stop when scrolling slows.

**Tap a card in the sheet.** When the focus is on a hub and the sheet shows its pursuits as cards, tapping a pursuit card animates the map camera to that pursuit's position. Sheet content updates. Dual driving — both surfaces can drive the same focus state.

**Drag the sheet.** Independent of map scroll. Reveals more or less detail without changing focus.

**No tapping the map directly.** The map is a journey, not a set of buttons. Navigation happens through scroll or through the sheet. This removes the screen-blocking "tap to open sheet" pattern that was breaking mobile UX before.

**No pinch zoom.** No two-finger gestures. Single-finger interactions only.

## Visual language

**The trunk.** The continuous spine, variable-width ribbon following the same living-spine geometry already implemented. Wider where active, narrower in transitions. The trunk is the connective tissue of the whole map.

**Faux perspective via scale.** Elements further along the path render at smaller scale; closer elements render larger. The "you are here" indicator marks the natural focal point. Scale interpolates smoothly as elements approach and pass the focal point.

**Theme limbs.** Branch off the trunk to the left or right. Each limb leads to a theme node, with the theme's colour as its accent.

**Hub spokes.** Branch off theme nodes in a small fan, like the current hub fan logic.

**Pursuit dots.** Branch off hubs along short connectors.

**Marks.** Sit on the trunk and on branches as small amber diamonds.

**Colour transitions.** As the user scrolls between themes, the trunk colour transitions through the theme palette — amber to purple to pink, etc. Already working in the previous spine implementation, carries over.

## Motion-first design

This map is defined by how it moves, not by what it looks like static.

**Reanimated springs everywhere.** No durations, no easing curves with magic numbers. Springs with sensible defaults — quick, light, decisive. Springs make the map feel alive without needing 3D.

**Animated state transitions.** When the focus changes, you see it: the indicator alignment, the camera scroll, the sheet content cross-fade. Nothing teleports.

**Haptic feedback.** Light haptic at each snap. Soft haptic when the sheet hits a snap point. Haptics are the cheapest premium feel on iOS.

**Decisive timing.** State transitions complete in 200-300ms. Springs settle quickly. The map feels responsive, not heavy.

## What stays from previous sessions

- Living-spine ribbon math (applied to the linear trunk)
- Active-theme weighting (wider trunk near active themes)
- All API data hooks (useBranches, useMarks)
- MapNode kinds and contracts
- Routes (/theme, /hub, /pursuit, /mark) — used for deep linking, not for in-map navigation
- Stream, Profile, Settings — completely unaffected

## What gets thrown away

- Radial geometry (Session 16 first attempt)
- Pan/pinch camera (Session 16 first attempt)
- Viewport-centre legend probe (Session 16 first attempt)
- The tap-to-sheet routing pattern from the original Candy Crush version
- Vertical Bézier chain trunk between themes (replaced by single continuous spine)

## Implementation phases

This is a multi-session rebuild. Each phase must be buildable and testable on its own:

- **Phase 1:** Linear geometry + snap-scroll skeleton. No sheet, no perspective. Prove the scroll-to-stop mechanics work.
- **Phase 2:** Bottom sheet with snap points + dual-driving focus state.
- **Phase 3:** Faux perspective via scale + Reanimated springs + haptics.
- **Phase 4:** Motion and timing polish — feel pass.

DECISIONS.md should record each phase as it ships.

## Why this is the right direction

The mobile map went through three iterations before arriving here. Vertical Candy Crush taught us the path-as-string metaphor swallowed the trunk. Radial pan-zoom taught us free-pan on a phone is too fiddly and top-down kills the sense of journey. This third model — Strava-style scrubbing with a dual-driving bottom sheet — is the synthesis. It is mobile-native, doesn't require 3D, doesn't require new dependencies, and respects what actually works on small touch screens.

Reference apps: Apple Maps (bottom sheet snap points), Strava (path scrubbing), Spotify Now Playing (dual-driving state), Linear (decisive animation timing).
# Mobile Vision — Radial Tree Canvas

*Captured: May 2026. Reconciled with repo: 2026-05-27.*

## The core idea

On desktop, Pathfinder is a poster: a branching tree you look at, pan across, and explore.

On mobile, Pathfinder is the same topology through a smaller camera: a central trunk,
themes radiating outward as limbs, and hubs gathered around each theme gateway.

The data model is shared. The mobile renderer owns its layout and camera.

---

## The interaction model

The map is a fixed-size radial canvas viewed through native pan and pinch-zoom.

The trunk is the spine of the map. Themes attach at authored heights along the trunk:

- **Trunk** = central life spine
- **Theme limbs** = major life areas emerging from the trunk
- **Hubs** = local clusters around each theme gateway
- **Pursuits** = small stops gathered around hubs
- **Marks** = checkpoints along hub branches

Tap behavior remains sheet-first: theme, hub, pursuit, and mark nodes open their existing
mobile detail screens.

---

## Key differences from desktop

| Desktop | Mobile |
|---------|--------|
| Large fixed SVG poster | Smaller fixed SVG canvas |
| Pan and zoom freely | Pan and pinch-zoom freely |
| Tree panels in a desktop rail | Tap-to-sheet navigation |
| Full visual grammar | Mobile-native visual grammar, shipped in phases |
| Hover affordances | Always-tappable nodes and labels |

---

## Navigation model

**Pan** moves the camera across the fixed canvas.

**Pinch-zoom** scales the canvas between bounded minimum and maximum zoom levels.

**Initial load** fits the canvas to the viewport and centres the trunk.

**Theme legend** tracks the theme gateway nearest the viewport centre.

---

## Visual language

The mobile map starts with the same node vocabulary but does not try to port desktop SVG code.
The radial topology is shared conceptually; the mobile renderer re-implements it in
`pathfinder-mobile`.

Node types read instantly from their shape and size:
- **Theme gateway** — large landmark node at the end of a theme limb.
- **Hub medallion** — mid-size node fanned around a gateway.
- **Pursuit dot** — small node clustered around a hub.
- **Mark diamond** — amber checkpoint on a hub branch.
- **Milestone marker** — deferred for a later canvas pass.

Session 16 establishes radial layout and camera only. Pursuit state, theme atmosphere,
milestones, and broken-node states are deferred.

---

## Capture flow on mobile

The primary mobile capture gesture: **"What happened today?"**

A persistent floating button at the bottom of the screen opens Stream.
The camera zooms slightly — a soft blur on the path behind the input sheet.
The user speaks or types. Cards appear. Confirmed items animate onto the path.
The sheet closes. Future sessions may pan the camera to the newly added node.

This is the mobile-native expression of [Stream](./STREAM.md).

---

## What this is not

This is not a stripped-down version of the desktop app.
It is not desktop code rendered at a smaller size.
It is the same data and topology expressed through a mobile-native renderer.

The desktop tree is a diagram that reveals structure.
The mobile tree is a portable canvas for the same structure.

Both should feel like Pathfinder — the typography, the colour system, the node vocabulary are shared.
The camera and interaction model are mobile-native.

---

## Implementation notes

The mobile map shares the same Prisma schema and API layer entirely.
The difference is purely in the rendering and interaction layer.

No schema changes are required or desired to support mobile.

---

## Open questions (unresolved)

**Pursuit state.** Bloom, on-hold, and completed states need a mobile-specific node treatment.

**Theme atmosphere.** The radial canvas needs depth and environment without copying desktop SVG filters.

**Milestones.** Desktop orbitals do not yet render on mobile.

**Broken-node states.** Deferred until the mobile node grammar is stable.

---

## Related docs

- [`../VISION.md`](../VISION.md) — product north star
- [`STREAM.md`](./STREAM.md) — Stream on desktop (shared intake)
- [`architecture.md`](./architecture.md) — persistence vs presentation
