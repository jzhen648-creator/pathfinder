import type { TreeRenderQuality } from "@/components/tree/tree-render-quality";

export const FLAGS = {
  MOCK_DATA: true,
  DEV_PANEL: true,
  PERF_MONITOR: true,
  FOCUS_MODE: true,
  /** Pointy-top hex goals, orbital milestone dots, thread stroke gap through hex interior. */
  GOAL_MILESTONES: true,
  /**
   * Goal bloom luminous preset: restrained / balanced / cinematic.
   * Cinematic explores tighter fields + jewel cores (deterministic SVG only — no particles).
   */
  TREE_GOAL_RENDER_QUALITY: "balanced" as TreeRenderQuality,
  /** Branch + button opens anchored NL goal flow instead of centred Add goal modal. */
  CONVERSATIONAL_GOAL_CREATE: true,
  /**
   * Central vascular trunk mass (silhouette + flow + post-stroke blend) behind life-area stems.
   * Off for a flatter, hub-forward composition; fork geometry still exposes `trunkAttach` (coincident with the theme gateway when the stem bridge is omitted).
   */
  TREE_TRUNK_VISIBLE: false,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] === true;
}
