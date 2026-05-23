import type { AreaData } from "./tree-types";

export type ThemeLayoutMode = "trunk-node" | "gateway-preview" | "gateway-live";

export type ThemeLayoutModeOptions = {
  /** Onboarding scenes — always use full gateway layout. */
  forceGatewayPreview?: boolean;
};

/**
 * Render-driven theme layout — decouples full gateway visuals from active DB hub rows.
 *
 * - gateway-live: real branches exist
 * - gateway-preview: empty branches — full medallion + ghost hub fan (dormant or ghost)
 * - trunk-node: deprecated fallback (unused when preview is enabled)
 */
export function resolveThemeLayoutMode(
  area: Pick<AreaData, "id" | "branches">,
  unlockedLimbIds: readonly string[],
  opts: ThemeLayoutModeOptions = {},
): ThemeLayoutMode {
  if (area.branches.length > 0) return "gateway-live";
  if (opts.forceGatewayPreview || unlockedLimbIds.includes(area.id)) return "gateway-preview";
  // Option A: dormant themes use same gateway layout, styled via DormantPulse.
  return "gateway-preview";
}

export function useGatewayThemeLayout(mode: ThemeLayoutMode): boolean {
  return mode === "gateway-live" || mode === "gateway-preview";
}
