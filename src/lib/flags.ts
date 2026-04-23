export const FLAGS = {
  // Core — always on
  LIFE_MAP:              true,
  GUIDED_FLOW:           true,
  TIMELINE_VIEW:         true,

  // AI features
  AI_MOMENT_EXTRACTION:  false,
  AI_SUGGESTIONS:        false,
  AI_DRAG_SUGGESTIONS:   false,

  // Future features (scaffolded)
  TURNING_POINTS:        false,
  BRANCH_SPLITS:         false,
  CONNECTIONS_VIEW:      false,
  DIARY_NOTES:           false,
  FINANCE_TRACKER:       false,

  // Visual options
  SHOW_FORK_DOTS:        false,
  SHOW_GRID_LINES:       false,
  SHOW_BACKGROUND_GLOBS: false,
  SHOW_FUTURE_RINGS:     false,

  // Dev tools
  DEV_PANEL:             true,
  PERF_MONITOR:          true,
  MOCK_DATA:             true,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] === true;
}

