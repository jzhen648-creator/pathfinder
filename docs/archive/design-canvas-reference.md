# Claude Design · Pathfinder tree reference

Source bundle: `Pathfinder CD/` (exported from Claude Design handle `7meCKlgVRkNKQurJE4hyTw`).

| File | Role |
|------|------|
| `Pathfinder.html` | Canvas index — sections 01 Work crop, 02 Grammar, 03 Desktop poster, 04 Tokens |
| `pf-data.jsx` | Themes, 17 hubs, Amelia persona, Stream sample copy |
| `pf-tree.jsx` | Poster tree SVG (`PosterTree`) — limbs, hex pursuits, diamonds, pentagon |
| `pf-app.jsx` | Interactive frames A/B/C, hub panel, Stream card + composer |
| `pf-grammar.jsx` | Annotated grammar sheet |
| `pf-crop.jsx` | Work limb zoom crop |

## Implemented in app (2026-05-20)

- **Pursuit hex silhouettes** — `tree-goal-visual.tsx` (`pointyTopHexPathD`)
- **Serif short theme labels** — `tree-svg.tsx` + `tree-design-visual.ts`
- **Pentagon trunk anchor** — `tree-pentagon-anchor.tsx` at `THEME_STAR_CENTER`
- **Stream card + composer** — `stream-confirmation-styles.ts`, `stream-composer.tsx`

## Not ported (layout remains authored geometry)

- Poster radial layout from `pfComputeLayout()` (domain-cluster + trunk slots stay in code)
- Longitudinal “hex on branch wire” placement (`BRANCH_LONGITUDINAL_ALL` still off)
- Dark immersive chrome replacing roadmap sidebar (product scope)

To preview the design file locally, open `Pathfinder CD/Pathfinder.html` in a browser.
