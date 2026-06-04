# Rename / restructure milestone (deferred)

Phases A–C of workspace cleanup are **docs + clutter only**. This file gates any **code or folder rename** that could break deploy.

## Recommended for now

Keep the folder name **`pathfinder/`**. Use [DESKTOP-ON-HOLD.md](../DESKTOP-ON-HOLD.md) to mark frozen desktop paths. No Vercel or mobile env changes required.

## Optional future: rename to `pathfinder-api/`

Only after explicit approval and completing the checklist below.

### Pre-flight checklist

- [ ] Vercel project root and build command (which directory Next builds)
- [ ] Any `vercel.json` or monorepo config pointing at `pathfinder/`
- [ ] CI scripts using `cd pathfinder`
- [ ] [START-HERE.md](../../START-HERE.md), [README.md](../../README.md), `.cursor/rules/pathfinder-current-state.mdc` — update all paths
- [ ] `pathfinder-mobile` docs — mostly URLs; confirm no hardcoded sibling folder paths
- [ ] Nested git: root workspace vs `pathfinder/` vs `pathfinder-mobile/` commit boundaries documented
- [ ] Local dev habits (`cd pathfinder`, `npm run backfill:*`) updated in MOBILE-DEV / AGENTS

### Higher-risk follow-ups (separate PRs)

- Move `src/components/tree/` under `legacy-desktop/` or feature-flag routes
- Remove unused `/tree` pages from default onboarding home
- Single-package monorepo (Expo + Next) — **not recommended** short term

## Lighter alternative (current default)

Document-only freeze via DESKTOP-ON-HOLD.md — **no folder rename.**
