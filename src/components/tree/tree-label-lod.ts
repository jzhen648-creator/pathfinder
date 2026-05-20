/**
 * Level-of-detail for tree map text labels — smooth ramps instead of hard zoom cutoffs.
 */

export type LimbLabelContext = {
  zoomRatio: number;
  limbFocused: boolean;
  /** Another limb is focused (Focus Mode). */
  limbDeemphasized: boolean;
};

/** Map zoomRatio through [lo, hi] → [minOpacity, 1]. */
export function treeLabelRampOpacity(
  zoomRatio: number,
  lo: number,
  hi: number,
  minOpacity = 0.45,
): number {
  if (zoomRatio <= lo) return minOpacity;
  if (zoomRatio >= hi) return 1;
  const t = (zoomRatio - lo) / (hi - lo);
  return minOpacity + t * (1 - minOpacity);
}

export function domainHubLabelOpacity(ctx: LimbLabelContext): number {
  if (ctx.limbDeemphasized) return 0.36;
  if (ctx.limbFocused) return 1;
  return treeLabelRampOpacity(ctx.zoomRatio, 0.88, 1.08, 0.72);
}

/** Slight scale-up when focused or zoomed in. */
export function domainHubLabelFontScale(ctx: LimbLabelContext): number {
  if (ctx.limbFocused) return 1.06;
  return treeLabelRampOpacity(ctx.zoomRatio, 0.85, 1.12, 0.9);
}

export function goalSurfaceTitleOpacity(
  ctx: LimbLabelContext & { depth: number; goalSelected: boolean },
): number {
  if (ctx.goalSelected) return 0.94;
  if (ctx.limbDeemphasized) return 0;
  if (ctx.limbFocused) return 0.86;
  const base = treeLabelRampOpacity(ctx.zoomRatio, 0.96, 1.28, 0.74);
  // Depth > 0 = evolution successors (`nestTreeGoalsForBranch` only nests via `parentGoalId`).
  // They need the same readable canvas label as root goals; a light fade keeps long chains tidy.
  const depthMul = ctx.depth <= 0 ? 1 : Math.max(0.78, 1 - ctx.depth * 0.06);
  return base * depthMul;
}

export function lifeAreaTitleOpacity(ctx: LimbLabelContext): number {
  if (ctx.limbDeemphasized) return 0.42;
  if (ctx.limbFocused) return 1;
  return 0.98;
}

export function threadPathLabelOpacity(ctx: LimbLabelContext): number {
  if (ctx.limbDeemphasized) return 0;
  if (ctx.limbFocused) return 0.95;
  return treeLabelRampOpacity(ctx.zoomRatio, 0.92, 1.15, 0.55);
}

/** Estimated label width for pill backgrounds (SVG px). */
export function treeLabelPillWidth(text: string, fontSizePx: number): number {
  return Math.min(240, Math.max(fontSizePx * 2.2, text.length * fontSizePx * 0.52)) + fontSizePx * 0.65;
}
